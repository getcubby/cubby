import assert from 'assert';
import debug from 'debug';
import files from './files.js';
import sqlutil from './sqlutil.js';
import database from './database.js';
import crypto from 'crypto';
import groups from './groups.js';
import mailer from './mailer.js';
import MainError from './mainerror.js';
import passwords from './password.js';
import users from './users.js';

const debugLog = debug('cubby:shares');

const SHARE_WITH_GROUP_NAME = `SELECT shares.*, groups.name AS receiver_group_name,
    owner_user.username AS owner_username, receiver_user.username AS receiver_username
    FROM shares
    LEFT JOIN groups ON groups.id = shares.receiver_group
    LEFT JOIN users owner_user ON owner_user.id = shares.owner_user_id
    LEFT JOIN users receiver_user ON receiver_user.id = shares.receiver_user_id`;

// in some queries we use the REGEXP operator so if input contains regexp chars we have to escape them
function escapeForSqlRegexp(text) {
    const specials = [
      '/', '.', '*', '+', '?', '|',
      '(', ')', '[', ']', '{', '}', '\\'
    ];
    const reg = new RegExp('(\\' + specials.join('|\\') + ')', 'g');

    return text.replace(reg, '\\$1');
}

function postProcess(data) {
    data.ownerUserId = data.owner_user_id;
    delete data.owner_user_id;

    data.ownerUsername = data.owner_username || null;
    delete data.owner_username;

    data.ownerGroupfolder = data.owner_groupfolder;
    delete data.owner_groupfolder;

    data.filePath = data.file_path;
    delete data.file_path;

    data.createdAt = data.created_at;
    delete data.created_at;

    data.expiresAt = data.expires_at;
    delete data.expires_at;

    data.receiverUserId = data.receiver_user_id || null;
    delete data.receiver_user_id;

    data.receiverUsername = data.receiver_username || null;
    delete data.receiver_username;

    data.receiverEmail = data.receiver_email;
    delete data.receiver_email;

    data.receiverGroup = data.receiver_group;
    delete data.receiver_group;

    data.receiverGroupName = data.receiver_group_name || null;
    delete data.receiver_group_name;

    data.passwordProtected = !!data.password_hash;
    delete data.password_hash;

    data.name = data.name || '';

    data.readonly = !!data.readonly;

    return data;
}

function isExpired(share) {
    if (!share || share.expiresAt == null) return false;

    const t = new Date(share.expiresAt).getTime();
    if (Number.isNaN(t)) return false;

    return t <= Date.now();
}

function isUnlocked(req, shareId) {
    return passwords.isUnlocked(req, 'shareUnlock', shareId);
}

async function listSharedWith(userId) {
    assert.strictEqual(typeof userId, 'string');

    debugLog(`list: ${userId}`);

    const result = await database.query(`${SHARE_WITH_GROUP_NAME} WHERE shares.receiver_user_id = ? OR shares.receiver_group IN (SELECT group_id FROM group_members WHERE user_id = ?)`, [ userId, userId ]);

    result.rows.forEach(postProcess);

    // only return non link shares
    return result.rows.filter(function (share) { return share.receiverUsername || share.receiverEmail || share.receiverGroup; }).filter(function (share) { return !isExpired(share); });
}

async function list(userId) {
    assert.strictEqual(typeof userId, 'string');

    debugLog(`listSharedWith: ${userId}`);

    const result = await database.query(`${SHARE_WITH_GROUP_NAME} WHERE shares.owner_user_id = ?`, [ userId ]);

    result.rows.forEach(postProcess);

    return result.rows;
}

async function create({ ownerUserId, ownerGroupfolder, filePath, receiverUserId, receiverEmail, receiverGroup = null, readonly, expiresAt = null, password = null, name = null }) {
    assert(typeof ownerUserId === 'string' || !ownerUserId);
    assert(typeof ownerGroupfolder === 'string' || !ownerGroupfolder);
    assert(filePath && typeof filePath === 'string');
    assert(typeof receiverUserId === 'string' || !receiverUserId);
    assert(typeof receiverEmail === 'string' || !receiverEmail);
    assert(typeof receiverGroup === 'string' || !receiverGroup);
    assert(typeof readonly === 'undefined' || typeof readonly === 'boolean');
    assert(expiresAt === null || (typeof expiresAt === 'number' && Number.isFinite(expiresAt)));
    assert(password === null || typeof password === 'string');
    assert(name === null || typeof name === 'string');

    // ensure we have a bool with false as fallback
    readonly = !!readonly;

    const expiresAtDb = expiresAt ? new Date(expiresAt) : null;

    debugLog(`create: ${ownerUserId || ownerGroupfolder} ${filePath} receiver:${receiverUserId || receiverEmail || receiverGroup || 'link'} readonly:${readonly} expiresAt:${expiresAtDb || 'none'}`);

    const fullFilePath = files.getAbsolutePath(ownerUserId || `groupfolder-${ownerGroupfolder}`, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    const shareId = 'sid-' + crypto.randomBytes(32).toString('hex');

    // passwords and names apply to public links (no receiver). Email shares may carry a name; user and group shares do not.
    const isPublicLink = !receiverUserId && !receiverEmail && !receiverGroup;
    const showsAsLink = !receiverUserId && !receiverGroup;
    const passwordHash = isPublicLink && password ? await passwords.hashPassword(password) : null;
    const shareName = showsAsLink ? (name || '').trim() : '';
    if (isPublicLink && !shareName) throw new MainError(MainError.BAD_FIELD, 'name must be a non-empty string');

    await database.query('INSERT INTO shares (id, owner_user_id, owner_groupfolder, file_path, receiver_email, receiver_user_id, receiver_group, readonly, expires_at, password_hash, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        shareId, ownerUserId || null, ownerGroupfolder || null, filePath, receiverEmail || null, receiverUserId || null, receiverGroup || null, readonly, expiresAtDb, passwordHash, shareName
    ]);

    // group shares just show up for members, no per-member email
    const notifyEmail = receiverUserId ? (await users.get(receiverUserId)).email : receiverEmail;
    if (notifyEmail) await mailer.newShare(notifyEmail, shareId);

    return shareId;
}

async function get(shareId) {
    assert.strictEqual(typeof shareId, 'string');

    debugLog(`get: ${shareId}`);

    const result = await database.query(`${SHARE_WITH_GROUP_NAME} WHERE shares.id = ?`, [ shareId ]);

    if (result.rows.length === 0) return null;

    return postProcess(result.rows[0]);
}

async function verifyPassword(shareId, candidatePassword) {
    assert.strictEqual(typeof shareId, 'string');
    assert.strictEqual(typeof candidatePassword, 'string');

    debugLog(`verifyPassword: ${shareId}`);

    const result = await database.query('SELECT password_hash FROM shares WHERE id = ?', [ shareId ]);

    if (result.rows.length === 0 || !result.rows[0].password_hash) return false;

    return await passwords.verifyPassword(candidatePassword, result.rows[0].password_hash);
}

async function getByOwnerAndFilepath(ownerUserId, ownerGroupfolder, filepath) {
    assert(typeof ownerUserId === 'string' || !ownerUserId);
    assert(typeof ownerGroupfolder === 'string' || !ownerGroupfolder);
    assert.strictEqual(typeof filepath, 'string');

    debugLog(`getByOwnerAndFilepath: ownerUserId:${ownerUserId} ownerGroupfolder:${ownerGroupfolder} filepath:${filepath}`);

    const result = await database.query(`${SHARE_WITH_GROUP_NAME} WHERE (shares.owner_user_id = ? OR shares.owner_groupfolder = ?) AND shares.file_path = ?`, [ ownerUserId, ownerGroupfolder, filepath ]);

    if (result.rows.length === 0) return null;

    result.rows.forEach(postProcess);

    return result.rows;
}

async function getByOwnerAndReceiverAndFilepath(ownerUserId, ownerGroupfolder, receiver, filepath, exactMatch = false) {
    assert(typeof ownerUserId === 'string' || !ownerUserId);
    assert(typeof ownerGroupfolder === 'string' || !ownerGroupfolder);
    assert.strictEqual(typeof receiver, 'string');
    assert.strictEqual(typeof filepath, 'string');
    assert.strictEqual(typeof exactMatch, 'boolean');

    debugLog(`getByOwnerAndReceiverAndFilepath: ownerUserId:${ownerUserId} ownerGroupfolder:${ownerGroupfolder} receiver:${receiver} exactMatch:${exactMatch} filepath:${filepath}`);

    let result;

    if (exactMatch) result = await database.query(`${SHARE_WITH_GROUP_NAME} WHERE (shares.receiver_email = ? OR shares.receiver_user_id = ? OR shares.receiver_group = ?) AND (shares.owner_user_id = ? OR shares.owner_groupfolder = ?) AND shares.file_path = ?`, [ receiver, receiver, receiver, ownerUserId, ownerGroupfolder, filepath ]);
    else result = await database.query(`${SHARE_WITH_GROUP_NAME} WHERE (shares.receiver_email = ? OR shares.receiver_user_id = ? OR shares.receiver_group = ?) AND (shares.owner_user_id = ? OR shares.owner_groupfolder = ?) AND shares.file_path REGEXP ?`, [ receiver, receiver, receiver, ownerUserId, ownerGroupfolder, `(^)${escapeForSqlRegexp(filepath)}(.*$)` ]);

    if (result.rows.length === 0) return null;

    result.rows.forEach(postProcess);

    return result.rows;
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

    // recursive move shares of child items
    const { sql: pathCondition, args: pathArgs } = sqlutil.pathCondition(fromPath, isDirectory);

    await database.query(`UPDATE shares SET owner_user_id = ?, owner_groupfolder = ?, file_path = ? || substr(file_path, length(?) + 1) WHERE (owner_user_id = ? OR owner_groupfolder = ?) AND ${pathCondition}`, [
        to.ownerUserId, to.ownerGroupfolder, toPath, fromPath, from.ownerUserId, from.ownerGroupfolder, ...pathArgs
    ]);
}

async function remove(shareId) {
    assert.strictEqual(typeof shareId, 'string');

    debugLog(`remove: ${shareId}`);

    await database.query('DELETE FROM shares WHERE id = ?', [ shareId ]);
}

async function removeByOwnerAndPath(owner, filePath, isDirectory) {
    assert.strictEqual(typeof owner, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof isDirectory, 'boolean');

    const { ownerUserId, ownerGroupfolder } = sqlutil.ownerToDbColumns(owner);

    debugLog(`removeByOwnerAndPath: ${owner}${filePath} isDirectory:${isDirectory}`);

    const { sql: pathCondition, args: pathArgs } = sqlutil.pathCondition(filePath, isDirectory);

    await database.query(`DELETE FROM shares WHERE (owner_user_id = ? OR owner_groupfolder = ?) AND ${pathCondition}`, [
        ownerUserId, ownerGroupfolder, ...pathArgs
    ]);
}

/**
 * Whether the given user id is allowed to access a share.
 * Public link shares and email shares follow the existing (no user binding) model.
 * @param {object} share
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function isReceiverAllowed(share, userId) {
    assert.strictEqual(typeof share, 'object');

    if (!share.receiverUserId && !share.receiverEmail && !share.receiverGroup) return true;

    if (share.receiverUserId) return share.receiverUserId === userId;

    if (share.receiverGroup) {
        if (!userId) return false;
        const groupIds = await groups.getMembershipGroupIds(userId);
        return groupIds.includes(share.receiverGroup);
    }

    // email shares keep the current behavior (no username check)
    return true;
}

export default {
    list,
    listSharedWith,
    get,
    create,
    verifyPassword,
    getByOwnerAndFilepath,
    getByOwnerAndReceiverAndFilepath,
    relocatePaths,
    remove,
    removeByOwnerAndPath,
    isExpired,
    isUnlocked,
    isReceiverAllowed
};
