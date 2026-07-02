import assert from 'assert';
import crypto from 'crypto';
import debug from 'debug';
import database from './database.js';
import files from './files.js';
import MainError from './mainerror.js';

const debugLog = debug('cubby:activity');

const ACTIONS = new Set([ 'created', 'updated', 'moved', 'copied', 'deleted', 'shared', 'unshared' ]);
const CONTENT_ACTIONS = [ 'created', 'updated', 'deleted', 'moved', 'copied' ];
const CONTENT_ACTIONS_SQL = CONTENT_ACTIONS.map((a) => `'${a}'`).join(', ');

function ownerToDbColumns(owner) {
    if (files.isGroupfolder(owner)) {
        return {
            ownerUsername: null,
            ownerGroupfolder: owner.slice('groupfolder-'.length)
        };
    }

    return {
        ownerUsername: owner,
        ownerGroupfolder: null
    };
}

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

    const { ownerUsername, ownerGroupfolder } = ownerToDbColumns(owner);

    debugLog(`log: ${actor} ${action} ${owner}${filePath}`);

    const id = 'act-' + crypto.randomBytes(16).toString('hex');

    await database.query('INSERT INTO file_activity (id, actor, owner_username, owner_groupfolder, file_path, action, details) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
        id, actor, ownerUsername, ownerGroupfolder, filePath, action, details ? JSON.stringify(details) : null
    ]);

    return id;
}

async function clearByPath(owner, filePath) {
    assert.strictEqual(typeof owner, 'string');
    assert.strictEqual(typeof filePath, 'string');

    const { ownerUsername, ownerGroupfolder } = ownerToDbColumns(owner);

    debugLog(`clearByPath: ${owner}${filePath}`);

    await database.query('DELETE FROM file_activity WHERE (owner_username = $1 OR owner_groupfolder = $2) AND file_path = $3', [ ownerUsername, ownerGroupfolder, filePath ]);
}

async function listByPath(owner, filePath, { limit = 50 } = {}) {
    assert.strictEqual(typeof owner, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof limit, 'number');

    const { ownerUsername, ownerGroupfolder } = ownerToDbColumns(owner);

    let includeDescendants = false;

    try {
        const entry = await files.head(owner, filePath);
        includeDescendants = entry.isDirectory;
    } catch (error) {
        if (error.reason !== MainError.NOT_FOUND) throw error;
    }

    debugLog(`listByPath: ${owner}${filePath} includeDescendants:${includeDescendants} limit:${limit}`);

    let result;

    if (includeDescendants) {
        result = await database.query(`SELECT * FROM file_activity WHERE (owner_username = $1 OR owner_groupfolder = $2) AND (file_path = $3 OR file_path LIKE $3 || '/%')
            ORDER BY created_at DESC LIMIT $4`, [ ownerUsername, ownerGroupfolder, filePath, limit ]);
    } else {
        result = await database.query('SELECT * FROM file_activity WHERE (owner_username = $1 OR owner_groupfolder = $2) AND file_path = $3 ORDER BY created_at DESC LIMIT $4', [
            ownerUsername, ownerGroupfolder, filePath, limit
        ]);
    }

    result.rows.forEach(postProcess);

    return result.rows;
}

async function lastActivityAt(owner, filePath, { recursive = false } = {}) {
    assert.strictEqual(typeof owner, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof recursive, 'boolean');

    const { ownerUsername, ownerGroupfolder } = ownerToDbColumns(owner);

    debugLog(`lastActivityAt: ${owner}${filePath} recursive:${recursive}`);

    let result;

    if (recursive) {
        result = await database.query(`SELECT MAX(created_at) AS last_activity_at FROM file_activity
            WHERE (owner_username = $1 OR owner_groupfolder = $2) AND (file_path = $3 OR file_path LIKE $3 || '/%') AND action IN (${CONTENT_ACTIONS_SQL})`, [ ownerUsername, ownerGroupfolder, filePath ]);
    } else {
        result = await database.query(`SELECT MAX(created_at) AS last_activity_at FROM file_activity
            WHERE (owner_username = $1 OR owner_groupfolder = $2) AND file_path = $3 AND action IN (${CONTENT_ACTIONS_SQL})`, [ ownerUsername, ownerGroupfolder, filePath ]);
    }

    const timestamp = result.rows[0]?.last_activity_at;
    if (!timestamp) return null;

    return new Date(timestamp);
}

async function relocatePaths({ fromOwner, fromPath, toOwner, toPath, isDirectory }) {
    assert.strictEqual(typeof fromOwner, 'string');
    assert.strictEqual(typeof fromPath, 'string');
    assert.strictEqual(typeof toOwner, 'string');
    assert.strictEqual(typeof toPath, 'string');
    assert.strictEqual(typeof isDirectory, 'boolean');

    const from = ownerToDbColumns(fromOwner);
    const to = ownerToDbColumns(toOwner);

    debugLog(`relocatePaths: ${fromOwner}${fromPath} -> ${toOwner}${toPath} isDirectory:${isDirectory}`);

    const pathCondition = isDirectory ? '(file_path = $5 OR file_path LIKE $5 || \'/%\')' : 'file_path = $5';

    await database.query(`UPDATE file_activity SET owner_username = $1, owner_groupfolder = $2, file_path = $6 || substring(file_path FROM length($5) + 1)
        WHERE (owner_username = $3 OR owner_groupfolder = $4) AND ${pathCondition}`, [
        to.ownerUsername, to.ownerGroupfolder, from.ownerUsername, from.ownerGroupfolder, fromPath, toPath
    ]);
}

export default {
    log,
    clearByPath,
    listByPath,
    lastActivityAt,
    relocatePaths
};
