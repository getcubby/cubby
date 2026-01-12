exports = module.exports = {
    HOME: 'home',

    isGroupfolder,

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

const assert = require('assert'),
    constants = require('./constants.js'),
    debug = require('debug')('cubby:files'),
    favorites = require('./favorites.js'),
    fs = require('fs'),
    fsExtra = require('fs-extra'),
    fsPromises = require('fs/promises'),
    groupFolders = require('./groupfolders.js'),
    path = require('path'),
    exec = require('./exec.js'),
    mime = require('./mime.js'),
    Entry = require('./entry.js'),
    shares = require('./shares.js'),
    recoll = require('./recoll.js'),
    diskusage = require('./diskusage.js'),
    MainError = require('./mainerror.js');

function isGroupfolder(usernameOrGroupfolder) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');

    return usernameOrGroupfolder.indexOf('groupfolder-') === 0;
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

    debug('addDirectory:', fullFilePath);

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

    debug(`addOrOverwriteFile: ${usernameOrGroupfolder} ${fullFilePath} mtime:${mtime} overwrite:${overwrite}`);

    if (fs.existsSync(fullFilePath) && !overwrite) throw new MainError(MainError.ALREADY_EXISTS);

    // we first upload to .part file and the rename
    const fullFilePathPart = fullFilePath + '.part';

    try {
        const pipeline = require('node:stream/promises').pipeline;
        await fsExtra.ensureDir(path.dirname(fullFilePath));
        const writeStream = require('fs').createWriteStream(fullFilePathPart);
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

    debug(`addOrOverwriteFileContents: ${usernameOrGroupfolder} ${fullFilePath} mtime:${mtime} overwrite:${overwrite}`);

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

    debug(`getDirectory: from ${usernameOrGroupfolder} at ${fullFilePath} filePath:${filePath}`);

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
                debug(`getDirectory: cannot stat ${path.join(fullFilePath, file)}`, e);
                return null;
            }
        }).filter(function (file) { return file && (file.stat.isDirectory() || file.stat.isFile()); }).map(function (file) {
            return new Entry({
                fullFilePath: file.fullFilePath,
                fileName: file.name,
                filePath: path.join(filePath, file.name),
                size: file.stat.size,
                mtime: file.stat.mtime,
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

    return new Entry({
        fullFilePath: fullFilePath,
        fileName: path.basename(filePath),
        filePath: filePath,
        size: size,
        mtime: stats.mtime,
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

    debug(`getFile: ${usernameOrGroupfolder} ${fullFilePath}`);

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

    debug(`get: ${usernameOrGroupfolder} ${filePath}`);

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

    debug(`head: ${usernameOrGroupfolder} ${filePath}`);

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

    debug(`move ${fullFilePath} -> ${fullNewFilePath}`);

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

async function copy(usernameOrGroupfolder, filePath, newUsernameOrGroupfolder, newFilePath) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof newUsernameOrGroupfolder, 'string');
    assert.strictEqual(typeof newFilePath, 'string');

    const fullFilePath = getAbsolutePath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    const fullNewFilePath = getAbsolutePath(newUsernameOrGroupfolder, newFilePath);
    if (!fullNewFilePath) throw new MainError(MainError.INVALID_PATH);

    debug(`copy ${fullFilePath} -> ${fullNewFilePath}`);

    try {
        // TODO add option for overwrite
        await fsPromises.cp(fullFilePath, fullNewFilePath, { force: false, recursive: true, errorOnExist: true });
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

    debug(`extract ${fullFilePath} -> ${fullNewFilePath}`);

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

    debug(`remove ${fullFilePath}`);

    try {
        await fsPromises.rm(fullFilePath, { recursive: true });
    } catch (error) {
        throw new MainError(MainError.FS_ERROR, error);
    }

    await runChangeHooks(usernameOrGroupfolder, path.dirname(fullFilePath));
}
