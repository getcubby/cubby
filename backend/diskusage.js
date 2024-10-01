exports = module.exports = {
    getByUsername,
    getByUsernameAndDirectory,
    calculateByUsernameAndDirectory,
    calculate
};

const assert = require('assert'),
    constants = require('./constants.js'),
    debug = require('debug')('cubby:diskusage'),
    exec = require('./exec.js'),
    files = require('./files.js'),
    groupFolders = require('./groupfolders.js'),
    users = require('./users.js'),
    path = require('path'),
    df = require('./df.js');

// { username: { used: int, directories: { filepath: size }}
const gCache = {};

// TODO make it work with username AND groupfolder
async function getByUsername(usernameOrGroupFolder) {
    assert.strictEqual(typeof usernameOrGroupFolder, 'string');

    debug(`getByUsername: ${usernameOrGroupFolder}`);

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

    debug(`getByUsernameAndDirectory: username:${username} directory:${filepath}`);

    if (!gCache[username]) await calculateByUsername(username);

    return gCache[username].directories[filepath] || 0;
}

// TODO remove deleted entries
// TODO update parent folders
async function calculateByUsernameAndDirectory(usernameOrGroupFolder, directoryPath) {
    assert.strictEqual(typeof usernameOrGroupFolder, 'string');
    assert.strictEqual(typeof directoryPath, 'string');

    debug(`calculateByUsernameAndDirectory: ${usernameOrGroupFolder} directory:${directoryPath}`);

    let folderRoot;

    if (files.isGroupfolder(usernameOrGroupFolder)) {
        const id = usernameOrGroupFolder.slice('groupfolder-'.length);
        const groupFolder = await groupFolders.get(id);
        folderRoot = groupFolder.groupFolder;
    } else {
        folderRoot = path.join(constants.USER_DATA_ROOT, usernameOrGroupFolder);
    }

    try {
        const out = exec('du', [ '-b', directoryPath ]);
        out.split('\n').filter(function (l) { return !!l; }).forEach(function (l) {
            const parts = l.split('\t');
            if (parts.length !== 2) return;

            // we treat the empty folder size as 0 for display purpose
            const size = parseInt(parts[0]) === 4096 ? 0 : parseInt(parts[0]);
            const filepath = parts[1].slice(folderRoot.length);

            if (filepath === '') gCache[usernameOrGroupFolder].used = size;
            else gCache[usernameOrGroupFolder].directories[filepath] = size;
        });
    } catch (error) {
        debug(`Failed to calculate usage for ${directoryPath}. Falling back to 0. ${error}`);
    }
}

async function calculateByUsername(usernameOrGroupFolder) {
    assert.strictEqual(typeof usernameOrGroupFolder, 'string');

    debug(`calculateByUsername: ${usernameOrGroupFolder}`);

    gCache[usernameOrGroupFolder] = {
        used: 0,
        directories: {}
    };

    if (files.isGroupfolder(usernameOrGroupFolder)) {
        const id = usernameOrGroupFolder.slice('groupfolder-'.length);
        const groupFolder = await groupFolders.get(id);

        try {
            const out = exec('du', [ '-b', groupFolder.folderPath ]);
            out.split('\n').filter(function (l) { return !!l; }).forEach(function (l) {
                const parts = l.split('\t');
                if (parts.length !== 2) return;

                // we treat the empty folder size as 0 for display purpose
                const size = parseInt(parts[0]) === 4096 ? 0 : parseInt(parts[0]);
                const filepath = parts[1].slice(groupFolder.folderPath.length);

                if (filepath === '') gCache[usernameOrGroupFolder].used = size;
                else gCache[usernameOrGroupFolder].directories[filepath] = size;
            });
        } catch (error) {
            debug(`Failed to calculate usage for ${usernameOrGroupFolder}. Falling back to 0. ${error}`);
        }
    } else {
        const username = usernameOrGroupFolder;

        try {
            const out = exec('du', [ '-b', path.join(constants.USER_DATA_ROOT, username) ]);
            out.split('\n').filter(function (l) { return !!l; }).forEach(function (l) {
                const parts = l.split('\t');
                if (parts.length !== 2) return;

                // we treat the empty folder size as 0 for display purpose
                const size = parseInt(parts[0]) === 4096 ? 0 : parseInt(parts[0]);
                const filepath = parts[1].slice(path.join(constants.USER_DATA_ROOT, username).length);

                if (filepath === '') gCache[username].used = size;
                else gCache[username].directories[filepath] = size;
            });
        } catch (error) {
            debug(`Failed to calculate usage for ${username}. Falling back to 0. ${error}`);
        }
    }
}

async function calculate() {
    debug(`calculate`);

    const userList = await users.list();
    for (const user of userList) await calculateByUsername(user.username);

    const groupFolderList = await groupFolders.list();
    for (const folder of groupFolderList) await calculateByUsername('groupfolder-' + folder.id);
}
