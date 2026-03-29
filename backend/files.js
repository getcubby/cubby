import assert from 'assert';
import constants from './constants.js';
import debug from 'debug';
import favorites from './favorites.js';
import fs from 'fs';
import fsExtra from 'fs-extra';
import fsPromises from 'fs/promises';
import groupFolders from './groupfolders.js';
import path from 'path';
import exec from './exec.js';
import mime from './mime.js';
import Entry from './entry.js';
import shares from './shares.js';
import recoll from './recoll.js';
import diskusage from './diskusage.js';
import MainError from './mainerror.js';
import { pipeline } from 'node:stream/promises';

const debugLog = debug('cubby:files');

function isGroupfolder(usernameOrGroupfolder) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');

    return usernameOrGroupfolder.indexOf('groupfolder-') === 0;
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
    const dataRoot = isGroupfolder(usernameOrGroupfolder) ? constants.GROUPS_DATA_ROOT : constants.USER_DATA_ROOT;
    const identifier = isGroupfolder(usernameOrGroupfolder) ? usernameOrGroupfolder.slice('groupfolder-'.length) : usernameOrGroupfolder;

    fs.mkdirSync(path.join(dataRoot, identifier), { recursive: true });

    const fullFilePath = path.resolve(path.join(dataRoot, identifier, filePath));
    if (fullFilePath.indexOf(path.join(dataRoot, identifier)) !== 0) return null;

    return fullFilePath;
}

async function runChangeHooks(usernameOrGroupfolder, filePath) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');

    await diskusage.calculateByUsernameAndDirectory(usernameOrGroupfolder, filePath);

    if (isGroupfolder(usernameOrGroupfolder)) {
        await recoll.indexByGroupFolder(usernameOrGroupfolder.slice('groupfolder-'.length), true);
    } else {
        await recoll.indexByUsername(usernameOrGroupfolder, true);
    }
}

async function addDirectory(usernameOrGroupfolder, filePath) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    debugLog('addDirectory:', fullFilePath);

    if (fs.existsSync(fullFilePath)) throw new MainError(MainError.ALREADY_EXISTS);

    try {
        await fsExtra.ensureDir(fullFilePath);
    } catch (error) {
        throw new MainError(MainError.FS_ERROR, error);
    }
}

async function addOrOverwriteFile(usernameOrGroupfolder, filePath, stream, mtime, overwrite) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof mtime, 'object');
    assert.strictEqual(typeof overwrite, 'boolean');
    assert.strictEqual(typeof stream, 'object');

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    debugLog(`addOrOverwriteFile: ${usernameOrGroupfolder} ${fullFilePath} mtime:${mtime} overwrite:${overwrite}`);

    if (fs.existsSync(fullFilePath) && !overwrite) throw new MainError(MainError.ALREADY_EXISTS);

    // we first upload to .part file and the rename
    const fullFilePathPart = fullFilePath + '.part';

    try {
        await fsExtra.ensureDir(path.dirname(fullFilePath));
        const writeStream = fs.createWriteStream(fullFilePathPart);
        await pipeline(stream, writeStream);

        // rename .part after upload pipeline finished
        await fsPromises.rename(fullFilePathPart, fullFilePath);
    } catch (error) {
        try { await fsPromises.rm(fullFilePathPart); } catch (e) {} // eslint-disable-line
        throw new MainError(MainError.FS_ERROR, error);
    }

    await runChangeHooks(usernameOrGroupfolder, path.dirname(fullFilePath));

    if (!mtime) return;

    try {
        var fd = fs.openSync(fullFilePath);
        fs.futimesSync(fd, mtime, mtime);
    } catch (error) {
        try { await fsPromises.rm(fullFilePath); } catch (e) {} // eslint-disable-line
        throw new MainError(MainError.FS_ERROR, error);
    }
}

async function addOrOverwriteFileContents(usernameOrGroupfolder, filePath, content, mtime, overwrite) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof mtime, 'object');
    assert.strictEqual(typeof overwrite, 'boolean');
    assert.strict(Buffer.isBuffer(content));

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    debugLog(`addOrOverwriteFileContents: ${usernameOrGroupfolder} ${fullFilePath} mtime:${mtime} overwrite:${overwrite}`);

    if (fs.existsSync(fullFilePath) && !overwrite) throw new MainError(MainError.ALREADY_EXISTS);

    try {
        await fsExtra.ensureDir(path.dirname(fullFilePath));
        await fsPromises.writeFile(fullFilePath, content, 'utf8');
    } catch (error) {
        throw new MainError(MainError.FS_ERROR, error);
    }

    await runChangeHooks(usernameOrGroupfolder, path.dirname(fullFilePath));

    if (!mtime) return;

    try {
        var fd = fs.openSync(fullFilePath);
        fs.futimesSync(fd, mtime, mtime);
    } catch (error) {
        throw new MainError(MainError.FS_ERROR, error);
    }
}

async function getDirectory(usernameOrGroupfolder, fullFilePath, filePath, stats) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof fullFilePath, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof stats, 'object');

    debugLog(`getDirectory: from ${usernameOrGroupfolder} at ${fullFilePath} filePath:${filePath}`);

    let files;

    const ownerUsername = isGroupfolder(usernameOrGroupfolder) ? null : usernameOrGroupfolder;
    const ownerGroupfolder = isGroupfolder(usernameOrGroupfolder) ? usernameOrGroupfolder.slice('groupfolder-'.length) : null;

    // for groups attach it
    const group = ownerGroupfolder ? await groupFolders.get(ownerGroupfolder) : null;

    try {
        const contents = await fsPromises.readdir(fullFilePath);
        files = contents.map(function (file) {
            try {
                const stat = fs.statSync(path.join(fullFilePath, file));
                return { name: file, stat: stat, fullFilePath: path.join(fullFilePath, file) };
            } catch (e) {
                debugLog(`getDirectory: cannot stat ${path.join(fullFilePath, file)}`, e);
                return null;
            }
        }).filter(function (file) { return file && (file.stat.isDirectory() || file.stat.isFile()); }).map(function (file) {
            return new Entry({
                fullFilePath: file.fullFilePath,
                fileName: file.name,
                filePath: path.join(filePath, file.name),
                size: file.stat.size,
                mtime: file.stat.mtime,
                atime: file.stat.atime,
                isDirectory: file.stat.isDirectory(),
                isFile: file.stat.isFile(),
                group: group,
                owner: usernameOrGroupfolder,
                mimeType: file.stat.isDirectory() ? 'inode/directory' : mime(file.name)
            });
        });
    } catch (error) {
        throw new MainError(MainError.FS_ERROR, error);
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
        mtime: stats.mtime,
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

    let result;
    try {
        result = await shares.getByOwnerAndFilepath(ownerUsername, ownerGroupfolder, filePath);
    } catch (error) {
        // TODO not sure what to do here
        console.error(error);
    }

    let size = 0;

    if (stats.isDirectory()) {
        try {
            size = await diskusage.getByUsernameAndDirectory(usernameOrGroupfolder, filePath);
        } catch (error) {
            console.error(error);
        }
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
        mtime: stats.mtime,
        atime: stats.atime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        sharedWith: result || [],
        owner: usernameOrGroupfolder,
        mimeType: stats.isDirectory() ? 'inode/directory' : mime(filePath)
    });
}

async function getByAbsolutePath(absolutePath) {
    assert.strictEqual(typeof absolutePath, 'string');

    if (absolutePath.indexOf(constants.USER_DATA_ROOT) === 0) {
        // user path
        const tmp = absolutePath.slice(constants.USER_DATA_ROOT.length);
        const username = tmp.split('/')[1];
        const filePath = tmp.slice(username.length+1);
        return await get(username, filePath);
    } else if (absolutePath.indexOf(constants.GROUPS_DATA_ROOT) === 0) {
        // groupfolder path
        const tmp = absolutePath.slice(constants.GROUPS_DATA_ROOT.length);
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

    let result;
    try {
        const stat = await fsPromises.stat(fullFilePath);
        if (stat.isDirectory()) result = await getDirectory(usernameOrGroupfolder, fullFilePath, filePath, stat);
        if (stat.isFile()) result = await getFile(usernameOrGroupfolder, fullFilePath, filePath, stat);
    } catch (error) {
        if (error.code === 'ENOENT') throw new MainError(MainError.NOT_FOUND);
        throw new MainError(MainError.FS_ERROR, error);
    }

    return result;
}

async function head(usernameOrGroupfolder, filePath) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');

    debugLog(`head: ${usernameOrGroupfolder} ${filePath}`);

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    try {
        const stat = await fsPromises.stat(fullFilePath);
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
    } catch (error) {
        if (error.code === 'ENOENT') throw new MainError(MainError.NOT_FOUND);
        throw new MainError(MainError.FS_ERROR, error);
    }
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

    try {
        // TODO add option for overwrite
        await fsExtra.move(fullFilePath, fullNewFilePath, { overwrite: false });
    } catch (error) {
        if (error.message === 'Source and destination must not be the same.') throw new MainError(MainError.CONFLICT);
        throw new MainError(MainError.FS_ERROR, error);
    }

    // TODO maybe be smart to check if folders are within the same parent folder
    await runChangeHooks(usernameOrGroupfolder, path.dirname(fullFilePath));
    await runChangeHooks(usernameOrGroupfolder, path.dirname(fullNewFilePath));
}

async function copy(usernameOrGroupfolder, filePath, newUsernameOrGroupfolder, newFilePath, overwrite = false) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof newUsernameOrGroupfolder, 'string');
    assert.strictEqual(typeof newFilePath, 'string');
    assert.strictEqual(typeof overwrite, 'boolean');

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    const fullNewFilePath = getAbsolutePath(newUsernameOrGroupfolder, newFilePath);
    if (!fullNewFilePath) throw new MainError(MainError.INVALID_PATH);

    debugLog(`copy ${fullFilePath} -> ${fullNewFilePath} overwrite=${overwrite}`);

    try {
        await fsPromises.cp(fullFilePath, fullNewFilePath, { force: overwrite, recursive: true, errorOnExist: !overwrite });
    } catch (error) {
        if (error.code === 'ERR_FS_CP_EINVAL') {
            if (error.info?.message === 'src and dest cannot be the same') throw new MainError(MainError.CONFLICT);
            else throw new MainError(MainError.BAD_FIELD);
        } else if (error.code === 'ERR_FS_CP_EEXIST') {
            throw new MainError(MainError.CONFLICT);
        } else {
            throw new MainError(MainError.FS_ERROR, error);
        }
    }

    await runChangeHooks(usernameOrGroupfolder, path.dirname(fullNewFilePath));
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

    try {
        await exec(cmd, args);
    } catch (error) {
        throw new MainError(MainError.EXTERNAL_ERROR, error.stderr);
    }

    await runChangeHooks(usernameOrGroupfolder, path.dirname(fullNewFilePath));
}

async function remove(usernameOrGroupfolder, filePath) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    debugLog(`remove ${fullFilePath}`);

    try {
        await fsPromises.rm(fullFilePath, { recursive: true });
    } catch (error) {
        throw new MainError(MainError.FS_ERROR, error);
    }

    await runChangeHooks(usernameOrGroupfolder, path.dirname(fullFilePath));
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
};
