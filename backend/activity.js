import assert from 'assert';
import crypto from 'crypto';
import debug from 'debug';
import database from './database.js';
import files from './files.js';
import sqlutil from './sqlutil.js';
import MainError from './mainerror.js';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:activity');

const ACTIONS = new Set([ 'created', 'updated', 'moved', 'copied', 'deleted', 'shared', 'unshared', 'filedrop_created', 'filedrop_deleted' ]);
const CONTENT_ACTIONS = [ 'created', 'updated', 'deleted', 'moved', 'copied' ];
const CONTENT_ACTIONS_SQL = CONTENT_ACTIONS.map((a) => `'${a}'`).join(', ');

function postProcess(data) {
    data.filePath = data.file_path;
    delete data.file_path;

    data.createdAt = data.created_at;
    delete data.created_at;

    if (data.owner_groupfolder) data.owner = `groupfolder-${data.owner_groupfolder}`;
    else data.owner = data.owner_user_id;
    delete data.owner_user_id;
    delete data.owner_groupfolder;

    data.actorUsername = data.actor_username || null;
    delete data.actor_username;

    if (data.details && typeof data.details === 'string') {
        data.details = JSON.parse(data.details);
    }

    return data;
}

async function log({ actor, owner, filePath, action, details = null }) {
    assert(actor === null || typeof actor === 'string');
    assert.strictEqual(typeof owner, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof action, 'string');
    assert(ACTIONS.has(action));
    assert(details === null || typeof details === 'object');

    const { ownerUserId, ownerGroupfolder } = sqlutil.ownerToDbColumns(owner);

    debugLog(`log: ${actor} ${action} ${owner}${filePath}`);

    const id = 'act-' + crypto.randomBytes(16).toString('hex');

    await database.query(`INSERT INTO file_activity (id, actor, owner_user_id, owner_groupfolder, file_path, action, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`, [
        id, actor, ownerUserId, ownerGroupfolder, filePath, action, details ? JSON.stringify(details) : null
    ]);

    return id;
}

async function clearByPath(owner, filePath) {
    assert.strictEqual(typeof owner, 'string');
    assert.strictEqual(typeof filePath, 'string');

    const { ownerUserId, ownerGroupfolder } = sqlutil.ownerToDbColumns(owner);

    debugLog(`clearByPath: ${owner}${filePath}`);

    await database.query('DELETE FROM file_activity WHERE (owner_user_id = ? OR owner_groupfolder = ?) AND file_path = ?', [ ownerUserId, ownerGroupfolder, filePath ]);
}

async function listByPath(owner, filePath, { limit = 50 } = {}) {
    assert.strictEqual(typeof owner, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof limit, 'number');

    const { ownerUserId, ownerGroupfolder } = sqlutil.ownerToDbColumns(owner);

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
        const { sql: pathCondition, args: pathArgs } = sqlutil.pathCondition(filePath, true);
        result = await database.query(`SELECT file_activity.*, users.username AS actor_username FROM file_activity LEFT JOIN users ON users.id = file_activity.actor WHERE (file_activity.owner_user_id = ? OR file_activity.owner_groupfolder = ?) AND ${pathCondition}
            ORDER BY file_activity.created_at DESC, file_activity.rowid DESC LIMIT ?`, [ ownerUserId, ownerGroupfolder, ...pathArgs, limit ]);
    } else {
        result = await database.query('SELECT file_activity.*, users.username AS actor_username FROM file_activity LEFT JOIN users ON users.id = file_activity.actor WHERE (file_activity.owner_user_id = ? OR file_activity.owner_groupfolder = ?) AND file_activity.file_path = ? ORDER BY file_activity.created_at DESC, file_activity.rowid DESC LIMIT ?', [
            ownerUserId, ownerGroupfolder, filePath, limit
        ]);
    }

    result.rows.forEach(postProcess);

    return result.rows;
}

async function lastActivityAt(owner, filePath, { recursive = false } = {}) {
    assert.strictEqual(typeof owner, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof recursive, 'boolean');

    const { ownerUserId, ownerGroupfolder } = sqlutil.ownerToDbColumns(owner);

    debugLog(`lastActivityAt: ${owner}${filePath} recursive:${recursive}`);

    let result;

    if (recursive) {
        const { sql: pathCondition, args: pathArgs } = sqlutil.pathCondition(filePath, true);
        result = await database.query(`SELECT MAX(created_at) AS last_activity_at FROM file_activity
            WHERE (owner_user_id = ? OR owner_groupfolder = ?) AND ${pathCondition} AND action IN (${CONTENT_ACTIONS_SQL})`, [ ownerUserId, ownerGroupfolder, ...pathArgs ]);
    } else {
        result = await database.query(`SELECT MAX(created_at) AS last_activity_at FROM file_activity
            WHERE (owner_user_id = ? OR owner_groupfolder = ?) AND file_path = ? AND action IN (${CONTENT_ACTIONS_SQL})`, [ ownerUserId, ownerGroupfolder, filePath ]);
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

    const from = sqlutil.ownerToDbColumns(fromOwner);
    const to = sqlutil.ownerToDbColumns(toOwner);

    debugLog(`relocatePaths: ${fromOwner}${fromPath} -> ${toOwner}${toPath} isDirectory:${isDirectory}`);

    const { sql: pathCondition, args: pathArgs } = sqlutil.pathCondition(fromPath, isDirectory);

    await database.query(`UPDATE file_activity SET owner_user_id = ?, owner_groupfolder = ?, file_path = ? || substr(file_path, length(?) + 1)
        WHERE (owner_user_id = ? OR owner_groupfolder = ?) AND ${pathCondition}`, [
        to.ownerUserId, to.ownerGroupfolder, toPath, fromPath, from.ownerUserId, from.ownerGroupfolder, ...pathArgs
    ]);
}

export default {
    log,
    clearByPath,
    listByPath,
    lastActivityAt,
    relocatePaths
};
