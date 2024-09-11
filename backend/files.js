exports = module.exports = {
    HOME: 'home',

    isGroupfolder,

    getValidFullPath,
    addDirectory,
    addOrOverwriteFile,
    addOrOverwriteFileContents,
    get,
    head,
    move,
    copy,
    remove,
    recent
};

const assert = require('assert'),
    constants = require('./constants.js'),
    debug = require('debug')('cubby:files'),
    fs = require('fs-extra'),
    path = require('path'),
    util = require('util'),
    exec = util.promisify(require('child_process').exec),
    mime = require('./mime.js'),
    Entry = require('./entry.js'),
    shares = require('./shares.js'),
    diskusage = require('./diskusage.js'),
    MainError = require('./mainerror.js');

function isGroupfolder(usernameOrGroupfolder) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');

    return usernameOrGroupfolder.indexOf('groupfolder-') === 0;
}

function getValidFullPath(usernameOrGroupfolder, filePath) {
    const dataRoot = isGroupfolder(usernameOrGroupfolder) ? constants.GROUPS_DATA_ROOT : constants.USER_DATA_ROOT;
    const identifier = isGroupfolder(usernameOrGroupfolder) ? usernameOrGroupfolder.slice('groupfolder-'.length) : usernameOrGroupfolder;

    fs.mkdirSync(path.join(dataRoot, identifier), { recursive: true });

    const fullFilePath = path.resolve(path.join(dataRoot, identifier, filePath));
    if (fullFilePath.indexOf(path.join(dataRoot, identifier)) !== 0) return null;

    return fullFilePath;
}

async function addDirectory(usernameOrGroupfolder, filePath) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');

    const fullFilePath = getValidFullPath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    debug('addDirectory:', fullFilePath);

    if (fs.existsSync(fullFilePath)) throw new MainError(MainError.ALREADY_EXISTS);

    try {
        await fs.ensureDir(fullFilePath);
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

    const fullFilePath = getValidFullPath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    debug(`addOrOverwriteFile: ${usernameOrGroupfolder} ${fullFilePath} mtime:${mtime} overwrite:${overwrite}`);

    var stat;
    try {
        stat = fs.statSync(fullFilePath);
    } catch (error) {
        if (error.code !== 'ENOENT') throw new MainError(MainError.FS_ERROR, error);
    }

    if (stat && !overwrite) throw new MainError(MainError.ALREADY_EXISTS);

    // we first upload to .part file and the rename
    const fullFilePathPart = fullFilePath + '.part';

    try {
        const pipeline = require('node:stream/promises').pipeline;
        await fs.ensureDir(path.dirname(fullFilePath));
        const writeStream = require('fs').createWriteStream(fullFilePathPart);
        await pipeline(stream, writeStream);

        // rename .part after upload pipeline finished
        await fs.rename(fullFilePathPart, fullFilePath);
    } catch (error) {
        try { await fs.remove(fullFilePathPart); } catch (e) {} // eslint-disable-line
        throw new MainError(MainError.FS_ERROR, error);
    }

    // kick off in background
    diskusage.calculateByUsernameAndDirectory(usernameOrGroupfolder, path.dirname(fullFilePath));

    if (!mtime) return;

    try {
        var fd = fs.openSync(fullFilePath);
        fs.futimesSync(fd, mtime, mtime);
    } catch (error) {
        try { await fs.remove(fullFilePath); } catch (e) {} // eslint-disable-line
        throw new MainError(MainError.FS_ERROR, error);
    }
}

async function addOrOverwriteFileContents(usernameOrGroupfolder, filePath, content, mtime, overwrite) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof mtime, 'object');
    assert.strictEqual(typeof overwrite, 'boolean');
    assert.strict(Buffer.isBuffer(content));

    const fullFilePath = getValidFullPath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    debug(`addOrOverwriteFileContents: ${usernameOrGroupfolder} ${fullFilePath} mtime:${mtime} overwrite:${overwrite}`);

    var stat;
    try {
        stat = fs.statSync(fullFilePath);
    } catch (error) {
        if (error.code !== 'ENOENT') throw new MainError(MainError.FS_ERROR, error);
    }

    if (stat && !overwrite) throw new MainError(MainError.ALREADY_EXISTS);

    try {
        await fs.ensureDir(path.dirname(fullFilePath));
        await fs.writeFile(fullFilePath, content, 'utf8');
    } catch (error) {
        throw new MainError(MainError.FS_ERROR, error);
    }

    await diskusage.calculateByUsernameAndDirectory(usernameOrGroupfolder, path.dirname(fullFilePath));

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

    try {
        const contents = await fs.readdir(fullFilePath);
        files = contents.map(function (file) {
            try {
                var stat = fs.statSync(path.join(fullFilePath, file));
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
                owner: usernameOrGroupfolder,
                mimeType: file.stat.isDirectory() ? 'inode/directory' : mime(file.name)
            });
        });
    } catch (error) {
        throw new MainError(MainError.FS_ERROR, error);
    }

    // attach shares
    const ownerUsername = isGroupfolder(usernameOrGroupfolder) ? null : usernameOrGroupfolder;
    const ownerGroupfolder = isGroupfolder(usernameOrGroupfolder) ? usernameOrGroupfolder.slice('groupfolder-'.length) : null;
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

    return new Entry({
        fullFilePath: fullFilePath,
        fileName: path.basename(filePath),
        filePath: filePath,
        size: size,
        mtime: stats.mtime,
        isDirectory: true,
        isFile: false,
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

    return new Entry({
        fullFilePath: fullFilePath,
        fileName: path.basename(fullFilePath),
        filePath: filePath,
        size: size,
        mtime: stats.mtime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        sharedWith: result || [],
        owner: usernameOrGroupfolder,
        mimeType: stats.isDirectory() ? 'inode/directory' : mime(filePath)
    });
}

async function get(usernameOrGroupfolder, filePath) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');

    debug(`get: ${usernameOrGroupfolder} ${filePath}`);

    const fullFilePath = getValidFullPath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    let result;
    try {
        const stat = await fs.stat(fullFilePath);
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

    const fullFilePath = getValidFullPath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    try {
        const stat = await fs.stat(fullFilePath);
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

    const fullFilePath = getValidFullPath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    const fullNewFilePath = getValidFullPath(newUsernameOrGroupfolder, newFilePath);
    if (!fullNewFilePath) throw new MainError(MainError.INVALID_PATH);

    debug(`move ${fullFilePath} -> ${fullNewFilePath}`);

    try {
        // TODO add option for overwrite
        await fs.move(fullFilePath, fullNewFilePath, { overwrite: false });
    } catch (error) {
        if (error.message === 'Source and destination must not be the same.') throw new MainError(MainError.CONFLICT);
        throw new MainError(MainError.FS_ERROR, error);
    }

    // TODO maybe be smart to check if folders are within the same parent folder
    await diskusage.calculateByUsernameAndDirectory(usernameOrGroupfolder, path.dirname(fullFilePath));
    await diskusage.calculateByUsernameAndDirectory(usernameOrGroupfolder, path.dirname(fullNewFilePath));
}

async function copy(usernameOrGroupfolder, filePath, newUsernameOrGroupfolder, newFilePath) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof newUsernameOrGroupfolder, 'string');
    assert.strictEqual(typeof newFilePath, 'string');

    const fullFilePath = getValidFullPath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    const fullNewFilePath = getValidFullPath(newUsernameOrGroupfolder, newFilePath);
    if (!fullNewFilePath) throw new MainError(MainError.INVALID_PATH);

    debug(`copy ${fullFilePath} -> ${fullNewFilePath}`);

    try {
        // TODO add option for overwrite
        await fs.copy(fullFilePath, fullNewFilePath, { overwrite: false });
    } catch (error) {
        if (error.message === 'Source and destination must not be the same.') throw new MainError(MainError.CONFLICT);
        throw new MainError(MainError.FS_ERROR, error);
    }

    await diskusage.calculateByUsernameAndDirectory(usernameOrGroupfolder, path.dirname(fullNewFilePath));
}

async function remove(usernameOrGroupfolder, filePath) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');

    const fullFilePath = getValidFullPath(usernameOrGroupfolder, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    debug(`remove ${fullFilePath}`);

    try {
        await fs.remove(fullFilePath);
    } catch (error) {
        throw new MainError(MainError.FS_ERROR, error);
    }

    await diskusage.calculateByUsernameAndDirectory(usernameOrGroupfolder, path.dirname(fullFilePath));
}

async function recent(usernameOrGroupfolder, daysAgo = 3, maxFiles = 100) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof daysAgo, 'number');

    const fullFilePath = getValidFullPath(usernameOrGroupfolder, '/');
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    let filePaths = [];
    try {
        // -mtime 3 == 3 days ago
        const { stdout } = await exec(`find ${fullFilePath} -type f -mtime -${daysAgo}`);
        filePaths = stdout.toString().split('\n').map(function (f) { return f.trim(); }).filter(function (f) { return !!f; });
    } catch (error) {
        throw new MainError(MainError.INTERNAL_ERROR, error);
    }

    const result = [];

    const localResolvedPrefix = path.join(constants.USER_DATA_ROOT, usernameOrGroupfolder);

    // we limit files to maxFiles
    for (const filePath of filePaths.slice(0, maxFiles)) {
        try {
            const stat = await fs.stat(filePath);
            if (!stat.isFile()) throw new MainError(MainError.FS_ERROR, 'recent should only list files');
            result.push(await getFile(usernameOrGroupfolder, filePath, filePath.slice(localResolvedPrefix.length), stat));
        } catch (error) {
            console.error(`Error in getting recent file ${filePath}`, error);
        }
    }

    return result;
}
