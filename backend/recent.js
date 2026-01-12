exports = module.exports = {
    add,
    remove,
    get,
    purge,
};

const assert = require('assert'),
    debug = require('debug')('cubby:recent'),
    constants = require('./constants.js'),
    fsPromises = require('fs/promises'),
    files = require('./files.js');

const MAX_AGE = 60 * 24 * 60 * 60 * 1000; // ~2 months

let recentsCache = {};
try {
    recentsCache = require(constants.RECENTS_CACHE_PATH);
// eslint-disable-next-line no-unused-vars
} catch (e) {
    console.log('No recent file cache found. Starting fresh.');
}

async function add(username, filePath) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof filePath, 'string');

    debug(`add: ${username} ${filePath}`);

    if (!recentsCache[username]) recentsCache[username] = [];

    const index = recentsCache[username].findIndex(e => { return e.filePath === filePath; });
    if (index !== -1) recentsCache[username].splice(index, 1);

    recentsCache[username].unshift({
        filePath,
        ts: Date.now()
    });

    await fsPromises.writeFile(constants.RECENTS_CACHE_PATH, JSON.stringify(recentsCache));
}

async function remove(username, filePath) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof filePath, 'string');

    debug(`remove: ${username} ${filePath}`);

    if (!recentsCache[username]) return;

    const index = recentsCache[username].findIndex(e => { return e.filePath === filePath; });
    if (index === -1) return;

    recentsCache[username].splice(index, 1);
}

async function get(username, daysAgo = 10, maxFiles = 100) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof daysAgo, 'number');
    assert.strictEqual(typeof maxFiles, 'number');

    const now = Date.now();
    const result = [];

    if (!recentsCache[username]) return;

    let i = 0;
    while(result.length < maxFiles && i < recentsCache[username].length) {
        const recent = recentsCache[username][i];
        if (now - recent.ts > MAX_AGE) break;

        try {
            result.push(await files.get(username, recent.filePath));
            i++;
        // eslint-disable-next-line no-unused-vars
        } catch (error) {
            console.error(`File not found ${username} ${recent.filePath}. Removing from recents.`);
            recentsCache[username].splice(i, 1);
        }
    }

    return result;
}

async function purge() {
    // TODO
}
