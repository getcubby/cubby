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

async function add(opener, resourcePath) {
    assert.strictEqual(typeof opener, 'string');
    assert.strictEqual(typeof resourcePath, 'string');

    debugLog(`add: ${opener} ${resourcePath}`);

    await database.query(`INSERT INTO recents (opener, resource_path, accessed_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (opener, resource_path) DO UPDATE SET accessed_at = CURRENT_TIMESTAMP`, [ opener, resourcePath ]);
}

async function remove(opener, resourcePath) {
    assert.strictEqual(typeof opener, 'string');
    assert.strictEqual(typeof resourcePath, 'string');

    debugLog(`remove: ${opener} ${resourcePath}`);

    await database.query('DELETE FROM recents WHERE opener = $1 AND resource_path = $2', [ opener, resourcePath ]);
}

async function removeEntry(opener, resourcePath) {
    await database.query('DELETE FROM recents WHERE opener = $1 AND resource_path = $2', [ opener, resourcePath ]);
}

async function get(opener, daysAgo = 10, maxFiles = 100) {
    assert.strictEqual(typeof opener, 'string');
    assert.strictEqual(typeof daysAgo, 'number');
    assert.strictEqual(typeof maxFiles, 'number');

    const now = Date.now();
    const result = [];

    const rows = await database.query('SELECT * FROM recents WHERE opener = $1 ORDER BY accessed_at DESC', [ opener ]);

    let i = 0;
    while (result.length < maxFiles && i < rows.rows.length) {
        const recent = postProcess(rows.rows[i]);
        if (now - recent.accessedAt.getTime() > MAX_AGE) break;

        try {
            const subject = await files.translateResourcePath(opener, recent.resourcePath);
            if (!subject) {
                await removeEntry(opener, recent.resourcePath);
                i++;
                continue;
            }

            if (subject.resource === 'shares') {
                const shareId = subject.resourcePath.slice(1).split('/')[1];
                const share = await shares.get(shareId);
                if (!share) {
                    await removeEntry(opener, recent.resourcePath);
                    i++;
                    continue;
                }

                const shareFilePath = subject.resourcePath.slice(1).split('/').slice(2).join('/');

                const file = await files.get(share.ownerUsername || `groupfolder-${share.ownerGroupfolder}`, path.join(share.filePath, shareFilePath));
                file.share = share;
                file.atime = recent.accessedAt;

                result.push(file.asShare(share.filePath).withoutPrivate(opener));
            } else {
                const file = await files.get(subject.usernameOrGroupfolder, subject.filePath);
                file.atime = recent.accessedAt;
                result.push(file.withoutPrivate(opener));
            }

            i++;
        // eslint-disable-next-line no-unused-vars
        } catch (error) {
            console.error(`File not found ${opener} ${recent.resourcePath}. Removing from recents.`);
            await removeEntry(opener, recent.resourcePath);
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
