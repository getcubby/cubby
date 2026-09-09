import assert from 'assert';
import debug from 'debug';
import files from './files.js';
import database from './database.js';
import crypto from 'crypto';
import MainError from './mainerror.js';
import passwords from './password.js';

const debugLog = debug('cubby:filedrops');

function postProcess(data) {
    data.ownerUsername = data.owner_username;
    delete data.owner_username;

    data.ownerGroupfolder = data.owner_groupfolder;
    delete data.owner_groupfolder;

    data.filePath = data.file_path;
    delete data.file_path;

    data.createdAt = data.created_at;
    delete data.created_at;

    data.expiresAt = data.expires_at;
    delete data.expires_at;

    data.passwordProtected = !!data.password_hash;
    delete data.password_hash;

    return data;
}

function isExpired(filedrop) {
    if (!filedrop || filedrop.expiresAt == null) return false;

    const t = new Date(filedrop.expiresAt).getTime();
    if (Number.isNaN(t)) return false;

    return t <= Date.now();
}

function isUnlocked(req, filedropId) {
    return passwords.isUnlocked(req, 'filedropUnlock', filedropId);
}

async function list(username) {
    assert.strictEqual(typeof username, 'string');

    debugLog(`list: ${username}`);

    const result = await database.query('SELECT * FROM filedrops WHERE owner_username = ?', [ username ]);

    result.rows.forEach(postProcess);

    return result.rows;
}

async function create({ ownerUsername, ownerGroupfolder, filePath, expiresAt = null, password = null }) {
    assert(typeof ownerUsername === 'string' || !ownerUsername);
    assert(typeof ownerGroupfolder === 'string' || !ownerGroupfolder);
    assert(filePath && typeof filePath === 'string');
    assert(expiresAt === null || (typeof expiresAt === 'number' && Number.isFinite(expiresAt)));
    assert(password === null || typeof password === 'string');

    const expiresAtDb = expiresAt ? new Date(expiresAt) : null;

    debugLog(`create: ${ownerUsername || ownerGroupfolder} ${filePath} expiresAt:${expiresAtDb || 'none'}`);

    const fullFilePath = files.getAbsolutePath(ownerUsername || `groupfolder-${ownerGroupfolder}`, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    const filedropId = 'fdp-' + crypto.randomBytes(32).toString('hex');

    const passwordHash = password ? await passwords.hashPassword(password) : null;

    await database.query('INSERT INTO filedrops (id, owner_username, owner_groupfolder, file_path, expires_at, password_hash) VALUES (?, ?, ?, ?, ?, ?)', [
        filedropId, ownerUsername || null, ownerGroupfolder || null, filePath, expiresAtDb, passwordHash
    ]);

    return filedropId;
}

async function get(filedropId) {
    assert.strictEqual(typeof filedropId, 'string');

    debugLog(`get: ${filedropId}`);

    const result = await database.query('SELECT * FROM filedrops WHERE id = ?', [ filedropId ]);

    if (result.rows.length === 0) return null;

    return postProcess(result.rows[0]);
}

async function verifyPassword(filedropId, candidatePassword) {
    assert.strictEqual(typeof filedropId, 'string');
    assert.strictEqual(typeof candidatePassword, 'string');

    debugLog(`verifyPassword: ${filedropId}`);

    const result = await database.query('SELECT password_hash FROM filedrops WHERE id = ?', [ filedropId ]);

    if (result.rows.length === 0 || !result.rows[0].password_hash) return false;

    return await passwords.verifyPassword(candidatePassword, result.rows[0].password_hash);
}

async function getByOwnerAndFilepath(ownerUsername, ownerGroupfolder, filepath) {
    assert(typeof ownerUsername === 'string' || !ownerUsername);
    assert(typeof ownerGroupfolder === 'string' || !ownerGroupfolder);
    assert.strictEqual(typeof filepath, 'string');

    debugLog(`getByOwnerAndFilepath: ownerUsername:${ownerUsername} ownerGroupfolder:${ownerGroupfolder} filepath:${filepath}`);

    const result = await database.query('SELECT * FROM filedrops WHERE (owner_username = ? OR owner_groupfolder = ?) AND file_path = ?', [ ownerUsername, ownerGroupfolder, filepath ]);

    if (result.rows.length === 0) return null;

    result.rows.forEach(postProcess);

    return result.rows;
}

async function remove(filedropId) {
    assert.strictEqual(typeof filedropId, 'string');

    debugLog(`remove: ${filedropId}`);

    await database.query('DELETE FROM filedrops WHERE id = ?', [ filedropId ]);
}

async function relocatePaths({ fromOwner, fromPath, toOwner, toPath, isDirectory }) {
    assert.strictEqual(typeof fromOwner, 'string');
    assert.strictEqual(typeof fromPath, 'string');
    assert.strictEqual(typeof toOwner, 'string');
    assert.strictEqual(typeof toPath, 'string');
    assert.strictEqual(typeof isDirectory, 'boolean');

    let fromOwnerUsername = null, fromOwnerGroupfolder = null;
    let toOwnerUsername = null, toOwnerGroupfolder = null;

    if (files.isGroupfolder(fromOwner)) {
        fromOwnerGroupfolder = fromOwner.slice('groupfolder-'.length);
    } else {
        fromOwnerUsername = fromOwner;
    }

    if (files.isGroupfolder(toOwner)) {
        toOwnerGroupfolder = toOwner.slice('groupfolder-'.length);
    } else {
        toOwnerUsername = toOwner;
    }

    debugLog(`relocatePaths: ${fromOwner}${fromPath} -> ${toOwner}${toPath} isDirectory:${isDirectory}`);

    const pathCondition = isDirectory ? '(file_path = ? OR file_path LIKE ? || \'/%\')' : 'file_path = ?';
    const pathArgs = isDirectory ? [ fromPath, fromPath ] : [ fromPath ];

    await database.query(`UPDATE filedrops SET owner_username = ?, owner_groupfolder = ?, file_path = ? || substr(file_path, length(?) + 1) WHERE (owner_username = ? OR owner_groupfolder = ?) AND ${pathCondition}`, [
        toOwnerUsername, toOwnerGroupfolder, toPath, fromPath, fromOwnerUsername, fromOwnerGroupfolder, ...pathArgs
    ]);
}

export default {
    list,
    create,
    get,
    verifyPassword,
    getByOwnerAndFilepath,
    remove,
    relocatePaths,
    isExpired,
    isUnlocked
};
