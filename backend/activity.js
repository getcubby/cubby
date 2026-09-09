import assert from 'assert';
import crypto from 'crypto';
import debug from 'debug';
import database from './database.js';
import files from './files.js';
import MainError from './mainerror.js';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:activity');

const ACTIONS = new Set([ 'created', 'updated', 'moved', 'copied', 'deleted', 'shared', 'unshared', 'filedrop_created', 'filedrop_deleted' ]);
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

    if (data.owner_groupfolder) data.owner = `groupfolder-${data.owner_groupfolder}`;
    else data.owner = data.owner_username;
    delete data.owner_username;
    delete data.owner_groupfolder;

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

    await database.query('INSERT INTO file_activity (id, actor, owner_username, owner_groupfolder, file_path, action, details) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        id, actor, ownerUsername, ownerGroupfolder, filePath, action, details ? JSON.stringify(details) : null
    ]);

    return id;
}

async function clearByPath(owner, filePath) {
    assert.strictEqual(typeof owner, 'string');
    assert.strictEqual(typeof filePath, 'string');

    const { ownerUsername, ownerGroupfolder } = ownerToDbColumns(owner);

    debugLog(`clearByPath: ${owner}${filePath}`);

    await database.query('DELETE FROM file_activity WHERE (owner_username = ? OR owner_groupfolder = ?) AND file_path = ?', [ ownerUsername, ownerGroupfolder, filePath ]);
}

async function listByPath(owner, filePath, { limit = 50 } = {}) {
    assert.strictEqual(typeof owner, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof limit, 'number');

    const { ownerUsername, ownerGroupfolder } = ownerToDbColumns(owner);

    let includeDescendants = false;

    const [headError, entry] = await safe(files.head(owner, filePath));
    if (headError) {
        if (headError.reason !== MainError.NOT_FOUND) throw headError;
    } else {
        includeDescendants = entry.isDirectory;
    }

    debugLog(`listByPath: ${owner}${filePath} includeDescendants:${includeDescendants} limit:${limit}`);

    let result;

    if (includeDescendants) {
        result = await database.query(`SELECT * FROM file_activity WHERE (owner_username = ? OR owner_groupfolder = ?) AND (file_path = ? OR file_path LIKE ? || '/%')
            ORDER BY created_at DESC, rowid DESC LIMIT ?`, [ ownerUsername, ownerGroupfolder, filePath, filePath, limit ]);
    } else {
        result = await database.query('SELECT * FROM file_activity WHERE (owner_username = ? OR owner_groupfolder = ?) AND file_path = ? ORDER BY created_at DESC, rowid DESC LIMIT ?', [
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
            WHERE (owner_username = ? OR owner_groupfolder = ?) AND (file_path = ? OR file_path LIKE ? || '/%') AND action IN (${CONTENT_ACTIONS_SQL})`, [ ownerUsername, ownerGroupfolder, filePath, filePath ]);
    } else {
        result = await database.query(`SELECT MAX(created_at) AS last_activity_at FROM file_activity
            WHERE (owner_username = ? OR owner_groupfolder = ?) AND file_path = ? AND action IN (${CONTENT_ACTIONS_SQL})`, [ ownerUsername, ownerGroupfolder, filePath ]);
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

    const pathCondition = isDirectory ? '(file_path = ? OR file_path LIKE ? || \'/%\')' : 'file_path = ?';
    const pathArgs = isDirectory ? [ fromPath, fromPath ] : [ fromPath ];

    await database.query(`UPDATE file_activity SET owner_username = ?, owner_groupfolder = ?, file_path = ? || substr(file_path, length(?) + 1)
        WHERE (owner_username = ? OR owner_groupfolder = ?) AND ${pathCondition}`, [
        to.ownerUsername, to.ownerGroupfolder, toPath, fromPath, from.ownerUsername, from.ownerGroupfolder, ...pathArgs
    ]);
}

export default {
    log,
    clearByPath,
    listByPath,
    lastActivityAt,
    relocatePaths
};
