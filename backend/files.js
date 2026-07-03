import assert from 'assert';
import paths from './paths.js';
import debug from 'debug';
import favorites from './favorites.js';
import fs from 'fs';
import fsPromises from 'fs/promises';
import groupFolders from './groupfolders.js';
import path from 'path';
import exec from './exec.js';
import mime from './mime.js';
import Entry from './entry.js';
import shares from './shares.js';
import recoll from './recoll.js';
import diskusage from './diskusage.js';
import activity from './activity.js';
import MainError from './mainerror.js';
import safe from '@cloudron/safetydance';
import { pipeline } from 'node:stream/promises';

const debugLog = debug('cubby:files');

function isGroupfolder(usernameOrGroupfolder) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');

    return usernameOrGroupfolder.indexOf('groupfolder-') === 0;
}

async function effectiveMtime(usernameOrGroupfolder, filePath, statMtime, recursive) {
    const activityAt = await activity.lastActivityAt(usernameOrGroupfolder, filePath, { recursive });
    if (!activityAt) return statMtime;
    return activityAt > statMtime ? activityAt : statMtime;
}

async function translateResourcePath(username, resourcePath) {
    const resource = resourcePath.split('/')[1];
    const filePath = resourcePath.slice(resource.length+1);

    // only shares may have optional auth
    if (resource !== 'shares' && !username) return null;

    if (resource === 'home') {
        return { resource, resourcePath, usernameOrGroupfolder: username, filePath };
    } else if (resource === 'shares') {
        const shareId = filePath.split('/')[1];
        if (!shareId) return null;

        const share = await shares.get(shareId);
        if (!share) return null;

        if (shares.isExpired(share)) return null;

        // check if this share is a public link or only for a specific user
        if (share.receiverUsername && share.receiverUsername !== username) return null;

        // actual path is without shares/<shareId>/
        return { resource, resourcePath, usernameOrGroupfolder: share.ownerUsername || `groupfolder-${share.ownerGroupfolder}`, filePath: path.join(share.filePath, filePath.split('/').slice(2).join('/')), share };
    } else if (resource === 'groupfolders') {
        const groupId = filePath.split('/')[1];
        if (!groupId) return null;

        const group = await groupFolders.get(groupId);

        // check if the user is part of the group
        if (!groupFolders.isPartOf(group, username)) return null;

        // actual path is without groupfolder/<groupId>/
        return { resource, resourcePath, usernameOrGroupfolder: `groupfolder-${group.id}`, filePath: '/' + filePath.split('/').slice(2).join('/') };
    } else {
        return null;
    }
}

function getAbsolutePath(usernameOrGroupfolder, filePath) {
    const dataRoot = isGroupfolder(usernameOrGroupfolder) ? paths.GROUPS_DATA_ROOT : paths.USER_DATA_ROOT;
    const identifier = isGroupfolder(usernameOrGroupfolder) ? usernameOrGroupfolder.slice('groupfolder-'.length) : usernameOrGroupfolder;

    fs.mkdirSync(path.join(dataRoot, identifier), { recursive: true });

    const fullFilePath = path.resolve(path.join(dataRoot, identifier, filePath));
    if (fullFilePath.indexOf(path.join(dataRoot, identifier)) !== 0) return null;

    return fullFilePath;
}

async function applyMtime(fullFilePath, mtime) {
    const fd = safe.fs.openSync(fullFilePath, 'r+');
    if (fd === -1) throw new MainError(MainError.FS_ERROR, safe.error);

    if (!safe.fs.futimesSync(fd, mtime, mtime)) {
        safe.fs.closeSync(fd);
        throw new MainError(MainError.FS_ERROR, safe.error);
    }

    safe.fs.closeSync(fd);
}

async function runChangeHooks(usernameOrGroupfolder, filePath, activityContext = null) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');

    const directoryPath = path.posix.dirname(filePath) || '/';
    await diskusage.calculateByUsernameAndDirectory(usernameOrGroupfolder, directoryPath);

    if (isGroupfolder(usernameOrGroupfolder)) {
        await recoll.indexByGroupFolder(usernameOrGroupfolder.slice('groupfolder-'.length), true);
    } else {
        await recoll.indexByUsername(usernameOrGroupfolder, true);
    }

    if (!activityContext) return;

    assert.strictEqual(typeof activityContext.actor, 'string');
    assert.strictEqual(typeof activityContext.action, 'string');

    // clear the actitvity log of a deleted file from the past
    if (activityContext.action === 'created') await activity.clearByPath(usernameOrGroupfolder, filePath);

    await activity.log({
        actor: activityContext.actor,
        owner: usernameOrGroupfolder,
        filePath,
        action: activityContext.action,
        details: activityContext.details ?? null
    });
}

async function addDirectory(usernameOrGroupfolder, filePath, { actor } = {}) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert(actor === undefined || typeof actor === 'string');

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    debugLog('addDirectory:', fullFilePath);

    if (fs.existsSync(fullFilePath)) throw new MainError(MainError.ALREADY_EXISTS);

    const [error] = await safe(fsPromises.mkdir(fullFilePath, { recursive: true }));
    if (error) throw new MainError(MainError.FS_ERROR, error);

    await runChangeHooks(usernameOrGroupfolder, filePath, actor ? { actor, action: 'created', details: { isDirectory: true } } : null);
}

async function addOrOverwriteFile(usernameOrGroupfolder, filePath, stream, mtime, overwrite, { actor } = {}) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof mtime, 'object');
    assert.strictEqual(typeof overwrite, 'boolean');
    assert.strictEqual(typeof stream, 'object');
    assert(actor === undefined || typeof actor === 'string');

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    debugLog(`addOrOverwriteFile: ${usernameOrGroupfolder} ${fullFilePath} mtime:${mtime} overwrite:${overwrite}`);

    const existed = fs.existsSync(fullFilePath);
    if (existed && !overwrite) throw new MainError(MainError.ALREADY_EXISTS);

    // we first upload to .part file and the rename
    const fullFilePathPart = fullFilePath + '.part';

    const [mkdirError] = await safe(fsPromises.mkdir(path.dirname(fullFilePath), { recursive: true }));
    if (mkdirError) {
        await safe(fsPromises.rm(fullFilePathPart));
        throw new MainError(MainError.FS_ERROR, mkdirError);
    }

    const writeStream = fs.createWriteStream(fullFilePathPart);
    const [pipelineError] = await safe(pipeline(stream, writeStream));
    if (pipelineError) {
        await safe(fsPromises.rm(fullFilePathPart));
        throw new MainError(MainError.FS_ERROR, pipelineError);
    }

    const [renameError] = await safe(fsPromises.rename(fullFilePathPart, fullFilePath));
    if (renameError) {
        await safe(fsPromises.rm(fullFilePathPart));
        throw new MainError(MainError.FS_ERROR, renameError);
    }

    await runChangeHooks(usernameOrGroupfolder, filePath, actor ? { actor, action: existed && overwrite ? 'updated' : 'created' } : null);

    if (!mtime) return;

    const [mtimeError] = await safe(applyMtime(fullFilePath, mtime));
    if (mtimeError) {
        await safe(fsPromises.rm(fullFilePath));
        throw mtimeError;
    }
}

async function addOrOverwriteFileContents(usernameOrGroupfolder, filePath, content, mtime, overwrite, { actor } = {}) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof mtime, 'object');
    assert.strictEqual(typeof overwrite, 'boolean');
    assert.strict(Buffer.isBuffer(content));
    assert(actor === undefined || typeof actor === 'string');

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    debugLog(`addOrOverwriteFileContents: ${usernameOrGroupfolder} ${fullFilePath} mtime:${mtime} overwrite:${overwrite}`);

    const existed = fs.existsSync(fullFilePath);
    if (existed && !overwrite) throw new MainError(MainError.ALREADY_EXISTS);

    const [mkdirError] = await safe(fsPromises.mkdir(path.dirname(fullFilePath), { recursive: true }));
    if (mkdirError) throw new MainError(MainError.FS_ERROR, mkdirError);

    const [writeError] = await safe(fsPromises.writeFile(fullFilePath, content, 'utf8'));
    if (writeError) throw new MainError(MainError.FS_ERROR, writeError);

    await runChangeHooks(usernameOrGroupfolder, filePath, actor ? { actor, action: existed && overwrite ? 'updated' : 'created' } : null);

    if (!mtime) return;

    const [mtimeError] = await safe(applyMtime(fullFilePath, mtime));
    if (mtimeError) throw mtimeError;
}

async function getDirectory(usernameOrGroupfolder, fullFilePath, filePath, stats) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof fullFilePath, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof stats, 'object');

    debugLog(`getDirectory: from ${usernameOrGroupfolder} at ${fullFilePath} filePath:${filePath}`);

    const ownerUsername = isGroupfolder(usernameOrGroupfolder) ? null : usernameOrGroupfolder;
    const ownerGroupfolder = isGroupfolder(usernameOrGroupfolder) ? usernameOrGroupfolder.slice('groupfolder-'.length) : null;

    // for groups attach it
    const group = ownerGroupfolder ? await groupFolders.get(ownerGroupfolder) : null;

    const [readdirError, contents] = await safe(fsPromises.readdir(fullFilePath));
    if (readdirError) throw new MainError(MainError.FS_ERROR, readdirError);

    const files = [];
    for (const name of contents) {
        const childFullPath = path.join(fullFilePath, name);
        const stat = safe.fs.statSync(childFullPath);
        if (!stat) {
            debugLog(`getDirectory: cannot stat ${childFullPath}`, safe.error);
            continue;
        }
        if (!stat.isDirectory() && !stat.isFile()) continue;

        const childFilePath = path.join(filePath, name);
        const mtime = await effectiveMtime(usernameOrGroupfolder, childFilePath, stat.mtime, stat.isDirectory());
        files.push(new Entry({
            fullFilePath: childFullPath,
            fileName: name,
            filePath: childFilePath,
            size: stat.size,
            mtime,
            atime: stat.atime,
            isDirectory: stat.isDirectory(),
            isFile: stat.isFile(),
            group: group,
            owner: usernameOrGroupfolder,
            mimeType: stat.isDirectory() ? 'inode/directory' : mime(name)
        }));
    }

    // attach shares
    const sharedWith = await shares.getByOwnerAndFilepath(ownerUsername, ownerGroupfolder, filePath);
    for (const file of files) {
        file.sharedWith = await shares.getByOwnerAndFilepath(ownerUsername, ownerGroupfolder, file.filePath);
    }

    // attach diskusage
    const size = await diskusage.getByUsernameAndDirectory(usernameOrGroupfolder, filePath);
    for (const file of files) {
        if (!file.isDirectory) continue;

        file.size = await diskusage.getByUsernameAndDirectory(usernameOrGroupfolder, file.filePath);
    }

    // attach favorites - rest api filters later and adds favorite property
    const favs = await favorites.listByOwnerAndFilePath(usernameOrGroupfolder, filePath);
    for (const file of files) {
        file.favorites = await favorites.listByOwnerAndFilePath(usernameOrGroupfolder, file.filePath);
    }

    const base = path.basename(filePath);
    const directoryFileName = base || (group ? group.name : path.basename(fullFilePath));

    return new Entry({
        fullFilePath: fullFilePath,
        fileName: directoryFileName,
        filePath: filePath,
        size: size,
        mtime: await effectiveMtime(usernameOrGroupfolder, filePath, stats.mtime, true),
        atime: stats.atime,
        isDirectory: true,
        isFile: false,
        group: group,
        favorites: favs,
        owner: usernameOrGroupfolder,
        sharedWith: sharedWith || [],
        mimeType: 'inode/directory',
        files: files
    });
}

async function getFile(usernameOrGroupfolder, fullFilePath, filePath, stats) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof fullFilePath, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof stats, 'object');

    debugLog(`getFile: ${usernameOrGroupfolder} ${fullFilePath}`);

    const ownerUsername = isGroupfolder(usernameOrGroupfolder) ? null : usernameOrGroupfolder;
    const ownerGroupfolder = isGroupfolder(usernameOrGroupfolder) ? usernameOrGroupfolder.slice('groupfolder-'.length) : null;

    const [sharesError, sharesResult] = await safe(shares.getByOwnerAndFilepath(ownerUsername, ownerGroupfolder, filePath));
    if (sharesError) console.error(sharesError);

    let size = 0;

    if (stats.isDirectory()) {
        const [duError, duSize] = await safe(diskusage.getByUsernameAndDirectory(usernameOrGroupfolder, filePath));
        if (duError) console.error(duError);
        else size = duSize;
    } else {
        size = stats.size;
    }

    // for groups attach it
    const group = ownerGroupfolder ? await groupFolders.get(ownerGroupfolder) : null;

    // attach favorites - rest api filters later and adds favorite property
    const favs = await favorites.listByOwnerAndFilePath(usernameOrGroupfolder, filePath);

    return new Entry({
        fullFilePath: fullFilePath,
        fileName: path.basename(fullFilePath),
        filePath: filePath,
        favorites: favs,
        size: size,
        group: group,
        mtime: await effectiveMtime(usernameOrGroupfolder, filePath, stats.mtime, false),
        atime: stats.atime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        sharedWith: sharesResult || [],
        owner: usernameOrGroupfolder,
        mimeType: stats.isDirectory() ? 'inode/directory' : mime(filePath)
    });
}

async function getByAbsolutePath(absolutePath) {
    assert.strictEqual(typeof absolutePath, 'string');

    if (absolutePath.indexOf(paths.USER_DATA_ROOT) === 0) {
        // user path
        const tmp = absolutePath.slice(paths.USER_DATA_ROOT.length);
        const username = tmp.split('/')[1];
        const filePath = tmp.slice(username.length+1);
        return await get(username, filePath);
    } else if (absolutePath.indexOf(paths.GROUPS_DATA_ROOT) === 0) {
        // groupfolder path
        const tmp = absolutePath.slice(paths.GROUPS_DATA_ROOT.length);
        const groupFolder = tmp.split('/')[1];
        const filePath = tmp.slice(groupFolder.length+1);
        return await get('groupfolder-' + groupFolder, filePath);
    }

    console.error(`getByAbsolutePath: invalid path, should not happen ${absolutePath}`);

    throw new MainError(MainError.NOT_FOUND);
}

async function get(usernameOrGroupfolder, filePath) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');

    debugLog(`get: ${usernameOrGroupfolder} ${filePath}`);

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    const [statError, stat] = await safe(fsPromises.stat(fullFilePath));
    if (statError) {
        if (statError.code === 'ENOENT') throw new MainError(MainError.NOT_FOUND);
        throw new MainError(MainError.FS_ERROR, statError);
    }

    let result;
    if (stat.isDirectory()) result = await getDirectory(usernameOrGroupfolder, fullFilePath, filePath, stat);
    if (stat.isFile()) result = await getFile(usernameOrGroupfolder, fullFilePath, filePath, stat);

    return result;
}

async function head(usernameOrGroupfolder, filePath) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');

    debugLog(`head: ${usernameOrGroupfolder} ${filePath}`);

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    const [statError, stat] = await safe(fsPromises.stat(fullFilePath));
    if (statError) {
        if (statError.code === 'ENOENT') throw new MainError(MainError.NOT_FOUND);
        throw new MainError(MainError.FS_ERROR, statError);
    }

    return {
        fileName: path.basename(fullFilePath),
        filePath: filePath,
        size: stat.size,
        mtime: stat.mtime,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        // sharedWith: result || [],
        owner: usernameOrGroupfolder,
        mimeType: stat.isDirectory() ? 'inode/directory' : mime(filePath)
    };
}

async function move(usernameOrGroupfolder, filePath, newUsernameOrGroupfolder, newFilePath) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof newUsernameOrGroupfolder, 'string');
    assert.strictEqual(typeof newFilePath, 'string');

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    const fullNewFilePath = getAbsolutePath(newUsernameOrGroupfolder, newFilePath);
    if (!fullNewFilePath) throw new MainError(MainError.INVALID_PATH);

    debugLog(`move ${fullFilePath} -> ${fullNewFilePath}`);

    if (path.resolve(fullFilePath) === path.resolve(fullNewFilePath)) throw new MainError(MainError.CONFLICT);

    const [mkdirError] = await safe(fsPromises.mkdir(path.dirname(fullNewFilePath), { recursive: true }));
    if (mkdirError) throw new MainError(MainError.FS_ERROR, mkdirError);

    const [renameError] = await safe(fsPromises.rename(fullFilePath, fullNewFilePath));
    if (renameError) {
        if (renameError.code === 'EEXIST') throw new MainError(MainError.CONFLICT);
        throw new MainError(MainError.FS_ERROR, renameError);
    }
}

async function copy(usernameOrGroupfolder, filePath, newUsernameOrGroupfolder, newFilePath, overwrite = false, { actor } = {}) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof newUsernameOrGroupfolder, 'string');
    assert.strictEqual(typeof newFilePath, 'string');
    assert.strictEqual(typeof overwrite, 'boolean');
    assert(actor === undefined || typeof actor === 'string');

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    const fullNewFilePath = getAbsolutePath(newUsernameOrGroupfolder, newFilePath);
    if (!fullNewFilePath) throw new MainError(MainError.INVALID_PATH);

    debugLog(`copy ${fullFilePath} -> ${fullNewFilePath} overwrite=${overwrite}`);

    const [copyError] = await safe(fsPromises.cp(fullFilePath, fullNewFilePath, { force: overwrite, recursive: true, errorOnExist: !overwrite }));
    if (copyError) {
        if (copyError.code === 'ERR_FS_CP_EINVAL') {
            if (copyError.info?.message === 'src and dest cannot be the same') throw new MainError(MainError.CONFLICT);
            throw new MainError(MainError.BAD_FIELD);
        }
        if (copyError.code === 'ERR_FS_CP_EEXIST') throw new MainError(MainError.CONFLICT);
        throw new MainError(MainError.FS_ERROR, copyError);
    }

    await runChangeHooks(newUsernameOrGroupfolder, newFilePath, actor ? { actor, action: 'copied', details: { fromOwner: usernameOrGroupfolder, fromPath: filePath } } : null);
}

async function extract(usernameOrGroupfolder, filePath, newUsernameOrGroupfolder, newFilePath) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof newUsernameOrGroupfolder, 'string');
    assert.strictEqual(typeof newFilePath, 'string');

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    const fullNewFilePath = getAbsolutePath(newUsernameOrGroupfolder, newFilePath);
    if (!fullNewFilePath) throw new MainError(MainError.INVALID_PATH);

    debugLog(`extract ${fullFilePath} -> ${fullNewFilePath}`);

    const tarFormats = ['.tar', '.tgz', '.tar.gz', '.tar.xz', '.tar.bz2'];

    let cmd, args;
    if (fullFilePath.endsWith('.zip')) {
        cmd = '/usr/bin/unzip';
        args = [ '-n', '-d', path.dirname(fullFilePath), fullFilePath ];
    } else if (tarFormats.findIndex(function (t) { return fullFilePath.endsWith(t); }) !== -1) {
        cmd = '/bin/tar';
        args = [ '-x', '-C', path.dirname(fullFilePath), '-f', fullFilePath ];
    } else if (fullFilePath.endsWith('.7z')) {
        cmd = '/usr/bin/7z';
        args = [ 'x', '-y', fullFilePath, `-o${path.dirname(fullFilePath)}` ];
    } else {
        throw new MainError(MainError.BAD_STATE, 'file is not an archive');
    }

    const [execError] = await safe(exec(cmd, args));
    if (execError) throw new MainError(MainError.EXTERNAL_ERROR, execError.stderr || execError);

    await runChangeHooks(newUsernameOrGroupfolder, newFilePath);
}

async function remove(usernameOrGroupfolder, filePath, { actor } = {}) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert(actor === undefined || typeof actor === 'string');

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    debugLog(`remove ${fullFilePath}`);

    const [error] = await safe(fsPromises.rm(fullFilePath, { recursive: true }));
    if (error) throw new MainError(MainError.FS_ERROR, error);

    await runChangeHooks(usernameOrGroupfolder, filePath, actor ? { actor, action: 'deleted' } : null);
}

export default {
    HOME: 'home',

    isGroupfolder,
    translateResourcePath,
    getAbsolutePath,

    addDirectory,
    addOrOverwriteFile,
    addOrOverwriteFileContents,
    getByAbsolutePath,
    get,
    head,
    move,
    copy,
    extract,
    remove,
    runChangeHooks,
};
