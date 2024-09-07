exports = module.exports = {
    getByUsername,
    getByUsernameAndDirectory,
    calculateByUsernameAndDirectory,
    calculate
};

const assert = require('assert'),
    debug = require('debug')('cubby:diskusage'),
    execSync = require('child_process').execSync,
    constants = require('./constants.js'),
    users = require('./users.js'),
    path = require('path'),
    df = require('./df.js');

// { username: { used: int, directories: { filepath: size }}
const gCache = {};

// TODO make it work with username AND groups
async function getByUsername(username) {
    assert.strictEqual(typeof username, 'string');

    debug(`getByUsername: username:${username}`);

    if (!gCache[username]) await calculateByUsername(username);

    // TODO use the quota if any set
    const result = await df.file(constants.USER_DATA_ROOT);

    return {
        used: gCache[username].used,
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
async function calculateByUsernameAndDirectory(username, directoryPath) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof directoryPath, 'string');

    debug(`calculateByUsernameAndDirectory: username:${username} directory:${directoryPath}`);

    try {
        const out = execSync(`du -b ${directoryPath}`, { encoding: 'utf8' });
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
        debug(`Failed to calculate usage for ${directoryPath}. Falling back to 0. ${error}`);
    }
}

async function calculateByUsername(username) {
    assert.strictEqual(typeof username, 'string');

    debug(`calculateByUsername: username:${username}`);

    gCache[username] = {
        used: 0,
        directories: {}
    };

    try {
        const out = execSync(`du -b ${path.join(constants.USER_DATA_ROOT, username)}`, { encoding: 'utf8' });
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

async function calculate() {
    debug(`calculate`);

    const userList = await users.list();

    for (const user of userList) {
        await calculateByUsername(user.username);
    }
}
