import assert from 'assert';
import crypto from 'crypto';
import debug from 'debug';
import database from './database.js';

const debugLog = debug('cubby:activity');

const ACTIONS = new Set([ 'created', 'updated', 'moved', 'copied', 'deleted', 'shared', 'unshared' ]);

function postProcess(data) {
    data.filePath = data.file_path;
    delete data.file_path;

    data.createdAt = data.created_at;
    delete data.created_at;

    if (data.details && typeof data.details === 'string') {
        data.details = JSON.parse(data.details);
    }

    return data;
}

async function log({ actor, owner, filePath, action, details = null }) {
    assert.strictEqual(typeof actor, 'string');
    assert.strictEqual(typeof owner, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof action, 'string');
    assert(ACTIONS.has(action));
    assert(details === null || typeof details === 'object');

    debugLog(`log: ${actor} ${action} ${owner}${filePath}`);

    const id = 'act-' + crypto.randomBytes(16).toString('hex');

    await database.query('INSERT INTO file_activity (id, actor, owner, file_path, action, details) VALUES ($1, $2, $3, $4, $5, $6)', [
        id, actor, owner, filePath, action, details ? JSON.stringify(details) : null
    ]);

    return id;
}

async function listByPath(owner, filePath, { includeDescendants = false, limit = 50 } = {}) {
    assert.strictEqual(typeof owner, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof includeDescendants, 'boolean');
    assert.strictEqual(typeof limit, 'number');

    debugLog(`listByPath: ${owner}${filePath} includeDescendants:${includeDescendants} limit:${limit}`);

    let result;

    if (includeDescendants) {
        result = await database.query(`SELECT * FROM file_activity WHERE owner = $1 AND (file_path = $2 OR file_path LIKE $2 || '/%')
            ORDER BY created_at DESC LIMIT $3`, [ owner, filePath, limit ]);
    } else {
        result = await database.query('SELECT * FROM file_activity WHERE owner = $1 AND file_path = $2 ORDER BY created_at DESC LIMIT $3', [
            owner, filePath, limit
        ]);
    }

    result.rows.forEach(postProcess);

    return result.rows;
}

async function relocatePaths({ fromOwner, fromPath, toOwner, toPath, isDirectory }) {
    assert.strictEqual(typeof fromOwner, 'string');
    assert.strictEqual(typeof fromPath, 'string');
    assert.strictEqual(typeof toOwner, 'string');
    assert.strictEqual(typeof toPath, 'string');
    assert.strictEqual(typeof isDirectory, 'boolean');

    debugLog(`relocatePaths: ${fromOwner}${fromPath} -> ${toOwner}${toPath} isDirectory:${isDirectory}`);

    const pathCondition = isDirectory ? '(file_path = $3 OR file_path LIKE $3 || \'/%\')' : 'file_path = $3';

    await database.query(`UPDATE file_activity SET owner = $1, file_path = $2 || substring(file_path FROM length($3) + 1)
        WHERE owner = $4 AND ${pathCondition}`, [ toOwner, toPath, fromPath, fromOwner ]);
}

export default {
    log,
    listByPath,
    relocatePaths
};
