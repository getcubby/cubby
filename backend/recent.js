exports = module.exports = {
    add,
    remove,
    get,
    purge,
};

const assert = require('assert'),
    debug = require('debug')('cubby:recent'),
    constants = require('./constants.js'),
    shares = require('./shares.js'),
    path = require('path'),
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

async function add(username, resourcePath) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof resourcePath, 'string');

    debug(`add: ${username} ${resourcePath}`);

    if (!recentsCache[username]) recentsCache[username] = [];

    const index = recentsCache[username].findIndex(e => { return e.resourcePath === resourcePath; });
    if (index !== -1) recentsCache[username].splice(index, 1);

    recentsCache[username].unshift({
        resourcePath,
        ts: Date.now()
    });

    await fsPromises.writeFile(constants.RECENTS_CACHE_PATH, JSON.stringify(recentsCache));
}

async function remove(username, resourcePath) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof resourcePath, 'string');

    debug(`remove: ${username} ${resourcePath}`);

    if (!recentsCache[username]) return;

    const index = recentsCache[username].findIndex(e => { return e.resourcePath === resourcePath; });
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
            const subject = await files.translateResourcePath(username, recent.resourcePath);
            if (!subject) {
                recentsCache[username].splice(i, 1);
                continue;
            }

            if (subject.resource === 'shares') {
                const shareId = subject.resourcePath.slice(1).split('/')[1];
                const share = await shares.get(shareId);
                if (!share) {
                    recentsCache[username].splice(i, 1);
                    continue;
                }

                const shareFilePath = subject.resourcePath.slice(1).split('/').slice(2).join('/');

                const file = await files.get(share.ownerUsername || `groupfolder-${share.ownerGroupfolder}`, path.join(share.filePath, shareFilePath));
                file.share = share;
                file.atime = new Date(recent.ts);

                result.push(file.asShare(share.filePath).withoutPrivate(username));
            } else {
                const file = await files.get(subject.usernameOrGroupfolder, subject.filePath);
                file.atime = new Date(recent.ts);
                result.push(file.withoutPrivate(username));
            }

            i++;
        // eslint-disable-next-line no-unused-vars
        } catch (error) {
            console.error(`File not found ${username} ${recent.resourcePath}. Removing from recents.`);
            recentsCache[username].splice(i, 1);
        }
    }

    return result;
}

async function purge() {
    // TODO
}
