import assert from 'assert';
import debug from 'debug';
import shares from './shares.js';
import path from 'path';
import files from './files.js';
import database from './database.js';

const debugLog = debug('cubby:recent');

const MAX_AGE = 60 * 24 * 60 * 60 * 1000; // ~2 months

function postProcess(data) {
    data.resourcePath = data.resource_path;
    delete data.resource_path;

    data.accessedAt = data.accessed_at;
    delete data.accessed_at;

    return data;
}

async function add(username, resourcePath) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof resourcePath, 'string');

    debugLog(`add: ${username} ${resourcePath}`);

    await database.query(`INSERT INTO recents (username, resource_path, accessed_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (username, resource_path) DO UPDATE SET accessed_at = CURRENT_TIMESTAMP`, [ username, resourcePath ]);
}

async function remove(username, resourcePath) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof resourcePath, 'string');

    debugLog(`remove: ${username} ${resourcePath}`);

    await database.query('DELETE FROM recents WHERE username = $1 AND resource_path = $2', [ username, resourcePath ]);
}

async function removeEntry(username, resourcePath) {
    await database.query('DELETE FROM recents WHERE username = $1 AND resource_path = $2', [ username, resourcePath ]);
}

async function get(username, daysAgo = 10, maxFiles = 100) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof daysAgo, 'number');
    assert.strictEqual(typeof maxFiles, 'number');

    const now = Date.now();
    const result = [];

    const rows = await database.query('SELECT * FROM recents WHERE username = $1 ORDER BY accessed_at DESC', [ username ]);

    let i = 0;
    while (result.length < maxFiles && i < rows.rows.length) {
        const recent = postProcess(rows.rows[i]);
        if (now - recent.accessedAt.getTime() > MAX_AGE) break;

        try {
            const subject = await files.translateResourcePath(username, recent.resourcePath);
            if (!subject) {
                await removeEntry(username, recent.resourcePath);
                i++;
                continue;
            }

            if (subject.resource === 'shares') {
                const shareId = subject.resourcePath.slice(1).split('/')[1];
                const share = await shares.get(shareId);
                if (!share) {
                    await removeEntry(username, recent.resourcePath);
                    i++;
                    continue;
                }

                const shareFilePath = subject.resourcePath.slice(1).split('/').slice(2).join('/');

                const file = await files.get(share.ownerUsername || `groupfolder-${share.ownerGroupfolder}`, path.join(share.filePath, shareFilePath));
                file.share = share;
                file.atime = recent.accessedAt;

                result.push(file.asShare(share.filePath).withoutPrivate(username));
            } else {
                const file = await files.get(subject.usernameOrGroupfolder, subject.filePath);
                file.atime = recent.accessedAt;
                result.push(file.withoutPrivate(username));
            }

            i++;
        // eslint-disable-next-line no-unused-vars
        } catch (error) {
            console.error(`File not found ${username} ${recent.resourcePath}. Removing from recents.`);
            await removeEntry(username, recent.resourcePath);
            i++;
        }
    }

    return result;
}

async function purge() {
    await database.query('DELETE FROM recents WHERE accessed_at < NOW() - INTERVAL \'60 days\'');
}

async function relocateResourcePaths({ fromResourcePrefix, toResourcePrefix, isDirectory }) {
    assert.strictEqual(typeof fromResourcePrefix, 'string');
    assert.strictEqual(typeof toResourcePrefix, 'string');
    assert.strictEqual(typeof isDirectory, 'boolean');

    debugLog(`relocateResourcePaths: ${fromResourcePrefix} -> ${toResourcePrefix} isDirectory:${isDirectory}`);

    if (isDirectory) {
        await database.query(`UPDATE recents SET resource_path = $2 || substring(resource_path FROM length($1) + 1)
            WHERE resource_path = $1 OR resource_path LIKE $1 || '/%'`, [ fromResourcePrefix, toResourcePrefix ]);
    } else {
        await database.query('UPDATE recents SET resource_path = $2 WHERE resource_path = $1', [ fromResourcePrefix, toResourcePrefix ]);
    }
}

export default {
    add,
    remove,
    get,
    purge,
    relocateResourcePaths
};
