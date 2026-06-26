import assert from 'assert';
import constants from './constants.js';
import debug from 'debug';
import exec from './exec.js';
import files from './files.js';
import groupFolders from './groupfolders.js';
import users from './users.js';
import path from 'path';
import df from './df.js';

const debugLog = debug('cubby:diskusage');

// { username: { used: int, directories: { filepath: size }}
const gCache = {};

async function getFolderRoot(usernameOrGroupFolder) {
    if (files.isGroupfolder(usernameOrGroupFolder)) {
        const id = usernameOrGroupFolder.slice('groupfolder-'.length);
        const groupFolder = await groupFolders.get(id);
        return groupFolder.folderPath;
    }

    return path.join(constants.USER_DATA_ROOT, usernameOrGroupFolder);
}

function ensureCache(usernameOrGroupFolder) {
    if (!gCache[usernameOrGroupFolder]) gCache[usernameOrGroupFolder] = { used: 0, directories: {} };
    return gCache[usernameOrGroupFolder];
}

function normalizeLogicalPath(folderRoot, absolutePathFromDu) {
    const filepath = absolutePathFromDu.slice(folderRoot.length);

    if (filepath === '') return '';

    return filepath.startsWith('/') ? filepath : '/' + filepath;
}

function pruneDirectoryFromCache(cache, directoryPath) {
    if (directoryPath === '/') {
        cache.used = 0;
        cache.directories = {};
        return;
    }

    delete cache.directories[directoryPath];

    const prefix = directoryPath + '/';
    for (const key of Object.keys(cache.directories)) {
        if (key.startsWith(prefix)) delete cache.directories[key];
    }
}

function applyDuLine(cache, folderRoot, size, absolutePathFromDu) {
    const filepath = normalizeLogicalPath(folderRoot, absolutePathFromDu);

    if (filepath === '') cache.used = size;
    else cache.directories[filepath] = size;
}

// TODO make it work with username AND groupfolder
async function getByUsername(usernameOrGroupFolder) {
    assert.strictEqual(typeof usernameOrGroupFolder, 'string');

    debugLog(`getByUsername: ${usernameOrGroupFolder}`);

    if (!gCache[usernameOrGroupFolder]) await calculateByUsername(usernameOrGroupFolder);

    // TODO use the quota if any set
    const result = await df.file(constants.USER_DATA_ROOT);

    return {
        used: gCache[usernameOrGroupFolder].used,
        available: result.available,
        size: result.size,
    };
}

async function getByUsernameAndDirectory(username, filepath) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof filepath, 'string');

    debugLog(`getByUsernameAndDirectory: username:${username} directory:${filepath}`);

    if (!gCache[username]) await calculateByUsername(username);

    if (filepath === '/') return gCache[username].used || 0;

    return gCache[username].directories[filepath] || 0;
}

async function refreshDirectorySubtree(usernameOrGroupFolder, directoryPath) {
    const absoluteDirectoryPath = files.getAbsolutePath(usernameOrGroupFolder, directoryPath);
    if (!absoluteDirectoryPath) return;

    const folderRoot = await getFolderRoot(usernameOrGroupFolder);
    const cache = ensureCache(usernameOrGroupFolder);

    pruneDirectoryFromCache(cache, directoryPath);

    try {
        const out = await exec('du', [ '-b', absoluteDirectoryPath ]);
        out.split('\n').filter(function (l) { return !!l; }).forEach(function (l) {
            const parts = l.split('\t');
            if (parts.length !== 2) return;

            const size = parseInt(parts[0]) === 4096 ? 0 : parseInt(parts[0]);
            applyDuLine(cache, folderRoot, size, parts[1]);
        });
    } catch (error) {
        debugLog(`Failed to calculate usage for ${directoryPath}. Falling back to 0. ${error}`);
    }
}

async function refreshDirectorySummary(usernameOrGroupFolder, directoryPath) {
    const absoluteDirectoryPath = files.getAbsolutePath(usernameOrGroupFolder, directoryPath);
    if (!absoluteDirectoryPath) return;

    const folderRoot = await getFolderRoot(usernameOrGroupFolder);
    const cache = ensureCache(usernameOrGroupFolder);

    try {
        const out = await exec('du', [ '-sb', absoluteDirectoryPath ]);
        const line = out.split('\n').filter(function (l) { return !!l; })[0];
        if (!line) return;

        const parts = line.split('\t');
        if (parts.length !== 2) return;

        const size = parseInt(parts[0]) === 4096 ? 0 : parseInt(parts[0]);
        applyDuLine(cache, folderRoot, size, parts[1]);
    } catch (error) {
        debugLog(`Failed to summarize usage for ${directoryPath}. Falling back to 0. ${error}`);
    }
}

async function calculateByUsernameAndDirectory(usernameOrGroupFolder, directoryPath) {
    assert.strictEqual(typeof usernameOrGroupFolder, 'string');
    assert.strictEqual(typeof directoryPath, 'string');

    debugLog(`calculateByUsernameAndDirectory: ${usernameOrGroupFolder} directory:${directoryPath}`);

    await refreshDirectorySubtree(usernameOrGroupFolder, directoryPath);

    if (directoryPath === '/') return;

    let ancestor = path.posix.dirname(directoryPath) || '/';
    while (true) {
        await refreshDirectorySummary(usernameOrGroupFolder, ancestor);
        if (ancestor === '/') break;

        const parent = path.posix.dirname(ancestor) || '/';
        if (parent === ancestor) break;
        ancestor = parent;
    }
}

async function calculateByUsername(usernameOrGroupFolder) {
    assert.strictEqual(typeof usernameOrGroupFolder, 'string');

    debugLog(`calculateByUsername: ${usernameOrGroupFolder}`);

    gCache[usernameOrGroupFolder] = {
        used: 0,
        directories: {}
    };

    await refreshDirectorySubtree(usernameOrGroupFolder, '/');
}

async function calculate() {
    debugLog(`calculate`);

    const userList = await users.list();
    for (const user of userList) await calculateByUsername(user.username);

    const groupFolderList = await groupFolders.list();
    for (const folder of groupFolderList) await calculateByUsername('groupfolder-' + folder.id);
}

export default {
    getByUsername,
    getByUsernameAndDirectory,
    calculateByUsernameAndDirectory,
    calculate
};
