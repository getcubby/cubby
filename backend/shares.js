'use strict';

exports = module.exports = {
    list,
    get,
    create,
    getByOwnerAndFilepath,
    getByOwnerAndReceiverAndFilepath,
    remove
};

var assert = require('assert'),
    debug = require('debug')('cubby:shares'),
    files = require('./files.js'),
    database = require('./database.js'),
    crypto = require('crypto'),
    mailer = require('./mailer.js'),
    MainError = require('./mainerror.js'),
    users = require('./users.js');

// in some queries we use postgres regexp so if input contains regexp chars we have to escape them
function escapeForSqlRegexp(text) {
    const specials = [
      '/', '.', '*', '+', '?', '|',
      '(', ')', '[', ']', '{', '}', '\\'
    ];
    const reg = new RegExp('(\\' + specials.join('|\\') + ')', 'g');

    return text.replace(reg, '\\$1');
}

function postProcess(data) {
    data.ownerUsername = data.owner_username;
    delete data.owner_username;

    data.ownerGroup = data.owner_group;
    delete data.owner_Group;

    data.filePath = data.file_path;
    delete data.file_path;

    data.createdAt = data.created_at;
    delete data.created_at;

    data.expiresAt = data.expires_at;
    delete data.expires_at;

    data.receiverUsername = data.receiver_username;
    delete data.receiver_username;

    data.receiverEmail = data.receiver_email;
    delete data.receiver_email;

    return data;
}

async function list(username) {
    assert.strictEqual(typeof username, 'string');

    debug(`list: ${username}`);

    const result = await database.query('SELECT * FROM shares WHERE receiver_username = $1', [ username ]);

    result.rows.forEach(postProcess);

    // only return non link shares
    return result.rows.filter(function (share) { return share.receiverUsername || share.receiverEmail; });
}

async function create({ ownerUsername, ownerGroup, filePath, receiverUsername, receiverEmail, readonly, expiresAt = 0 }) {
    assert(typeof ownerUsername === 'string' || !ownerUsername);
    assert(typeof ownerGroup === 'string' || !ownerGroup);
    assert(filePath && typeof filePath === 'string');
    assert(typeof receiverUsername === 'string' || !receiverUsername);
    assert(typeof receiverEmail === 'string' || !receiverEmail);
    assert(typeof readonly === 'undefined' || typeof readonly === 'boolean');
    assert.strictEqual(typeof expiresAt, 'number');

    // ensure we have a bool with false as fallback
    readonly = !!readonly;

    debug(`create: ${ownerUsername || ownerGroup} ${filePath} receiver:${receiverUsername || receiverEmail || 'link'} readonly:${readonly} expiresAt:${expiresAt}`);

    const fullFilePath = files.getValidFullPath(ownerUsername || `group-${ownerGroup}`, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    const shareId = 'sid-' + crypto.randomBytes(32).toString('hex');

    await database.query('INSERT INTO shares (id, owner_username, owner_group, file_path, receiver_email, receiver_username, readonly, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [
        shareId, ownerUsername || null, ownerGroup || null, filePath, receiverEmail || null, receiverUsername || null, readonly, expiresAt || null
    ]);

    const notifyEmail = receiverUsername ? (await users.get(receiverUsername)).email : receiverEmail;
    if (notifyEmail) await mailer.newShare(notifyEmail, shareId);

    return shareId;
}

async function get(shareId) {
    assert.strictEqual(typeof shareId, 'string');

    debug(`get: ${shareId}`);

    const result = await database.query('SELECT * FROM shares WHERE id = $1', [ shareId ]);

    if (result.rows.length === 0) return null;

    return postProcess(result.rows[0]);
}

async function getByOwnerAndFilepath(ownerUsername, ownerGroup, filepath) {
    assert(typeof ownerUsername === 'string' || !ownerUsername);
    assert(typeof ownerGroup === 'string' || !ownerGroup);
    assert.strictEqual(typeof filepath, 'string');

    debug(`getByOwnerAndFilepath: ownerUsername:${ownerUsername} ownerGroup:${ownerGroup} filepath:${filepath}`);

    const result = await database.query('SELECT * FROM shares WHERE (owner_username = $1 OR owner_group = $2) AND file_path ~ $3', [ ownerUsername, ownerGroup, `(^)${escapeForSqlRegexp(filepath)}(.*$)` ]);

    if (result.rows.length === 0) return null;

    result.rows.forEach(postProcess);

    return result.rows;
}

async function getByOwnerAndReceiverAndFilepath(ownerUsername, ownerGroup, receiver, filepath, exactMatch = false) {
    assert(typeof ownerUsername === 'string' || !ownerUsername);
    assert(typeof ownerGroup === 'string' || !ownerGroup);
    assert.strictEqual(typeof receiver, 'string');
    assert.strictEqual(typeof filepath, 'string');
    assert.strictEqual(typeof exactMatch, 'boolean');

    debug(`getByOwnerAndReceiverAndFilepath: ownerUsername:${ownerUsername} ownerGroup:${ownerGroup} receiver:${receiver} exactMatch:${exactMatch} filepath:${filepath}`);

    let result;

    if (exactMatch) result = await database.query('SELECT * FROM shares WHERE (receiver_email = $1 OR receiver_username = $1) AND (owner_username = $2 OR owner_group = $3) AND file_path = $4', [ receiver, ownerUsername, ownerGroup, filepath ]);
    else result = await database.query('SELECT * FROM shares WHERE (receiver_email = $1 OR receiver_username = $1) AND (owner_username = $2 OR owner_group = $3) AND file_path ~ $4', [ receiver, ownerUsername, ownerGroup, `(^)${escapeForSqlRegexp(filepath)}(.*$)` ]);

    if (result.rows.length === 0) return null;

    result.rows.forEach(postProcess);

    return result.rows;
}

async function remove(shareId) {
    assert.strictEqual(typeof shareId, 'string');

    debug(`remove: ${shareId}`);

    await database.query('DELETE FROM shares WHERE id = $1', [ shareId ]);
}
