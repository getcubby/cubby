import assert from 'assert';
import debug from 'debug';
import files from './files.js';
import sqlutil from './sqlutil.js';
import shares from './shares.js';
import database from './database.js';
import crypto from 'crypto';
import path from 'path';
import MainError from './mainerror.js';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:favorites');

function postProcess(data) {
    data.userId = data.user_id;
    delete data.user_id;

    data.filePath = data.file_path;
    delete data.file_path;

    data.shareId = data.share_id;
    delete data.share_id;

    data.createdAt = data.created_at;
    delete data.created_at;

    if (data.owner_groupfolder) data.owner = `groupfolder-${data.owner_groupfolder}`;
    else data.owner = data.owner_user_id;
    delete data.owner_user_id;
    delete data.owner_groupfolder;

    return data;
}

async function listByOwnerAndFilePath(owner, filePath) {
    assert(typeof owner === 'string');
    assert(typeof filePath === 'string');

    const { ownerUserId, ownerGroupfolder } = sqlutil.ownerToDbColumns(owner);

    debugLog(`listByOwnerAndFilePath: ${owner} ${filePath}`);

    const result = await database.query('SELECT * FROM favorites WHERE share_id IS NULL AND (owner_user_id = ? OR owner_groupfolder = ?) AND file_path = ?', [ ownerUserId, ownerGroupfolder, filePath ]);

    result.rows.forEach(postProcess);

    return result.rows;
}

async function listByShareAndFilePath(shareId, filePath) {
    assert(typeof shareId === 'string');
    assert(typeof filePath === 'string');

    debugLog(`listByShareAndFilePath: ${shareId} ${filePath}`);

    const result = await database.query('SELECT * FROM favorites WHERE share_id = ? AND file_path = ?', [ shareId, filePath ]);

    result.rows.forEach(postProcess);

    return result.rows;
}

async function attachToShareTree(entry, shareId) {
    entry.favorites = await listByShareAndFilePath(shareId, entry.filePath);
    for (const file of entry.files) {
        await attachToShareTree(file, shareId);
    }
}

async function list(username) {
    assert.strictEqual(typeof username, 'string');

    debugLog(`list: ${username}`);

    const result = await database.query('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC, rowid DESC', [ username ]);

    result.rows.forEach(postProcess);

    return result.rows;
}

async function findExistingId(username, { shareId, ownerUserId, ownerGroupfolder, filePath }) {
    if (shareId) {
        const result = await database.query('SELECT id FROM favorites WHERE user_id = ? AND share_id = ? AND file_path = ?', [ username, shareId, filePath ]);
        return result.rows[0]?.id || null;
    }

    const result = await database.query('SELECT id FROM favorites WHERE user_id = ? AND share_id IS NULL AND owner_user_id IS ? AND owner_groupfolder IS ? AND file_path = ?', [
        username, ownerUserId, ownerGroupfolder, filePath
    ]);
    return result.rows[0]?.id || null;
}

function canonicalFromShareFavorite(shareRoot, filePath) {
    if (filePath === '/') return shareRoot;
    return path.posix.join(shareRoot, filePath);
}

async function create(username, { owner, filePath, shareId = null }) {
    assert(typeof username === 'string');
    assert(filePath && typeof filePath === 'string');
    assert(shareId === null || typeof shareId === 'string');

    filePath = filePath.replace(/\/+/g, '/');
    if (!filePath.startsWith('/')) filePath = '/' + filePath;

    debugLog(`create: ${username} share:${shareId || 'none'} ${filePath}`);

    let ownerUserId = null;
    let ownerGroupfolder = null;

    if (shareId) {
        const share = await shares.get(shareId);
        if (!share) throw new MainError(MainError.NOT_FOUND);

        const shareOwner = share.ownerUserId || `groupfolder-${share.ownerGroupfolder}`;
        const canonicalPath = canonicalFromShareFavorite(share.filePath, filePath);
        const fullFilePath = files.getAbsolutePath(shareOwner, canonicalPath);
        if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);
    } else {
        assert(typeof owner === 'string');

        const ownerColumns = sqlutil.ownerToDbColumns(owner);
        ownerUserId = ownerColumns.ownerUserId;
        ownerGroupfolder = ownerColumns.ownerGroupfolder;

        const fullFilePath = files.getAbsolutePath(owner, filePath);
        if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);
    }

    const existingId = await findExistingId(username, { shareId, ownerUserId, ownerGroupfolder, filePath });
    if (existingId) return existingId;

    const id = crypto.randomUUID();

    const [error] = await safe(database.query('INSERT INTO favorites (id, user_id, share_id, owner_user_id, owner_groupfolder, file_path) VALUES (?, ?, ?, ?, ?, ?)', [
        id, username, shareId, ownerUserId, ownerGroupfolder, filePath
    ]));
    if (error) {
        const retryId = await findExistingId(username, { shareId, ownerUserId, ownerGroupfolder, filePath });
        if (retryId) return retryId;
        throw new MainError(MainError.BAD_STATE, error);
    }

    return id;
}

async function get(id) {
    assert.strictEqual(typeof id, 'string');

    debugLog(`get: ${id}`);

    const result = await database.query('SELECT * FROM favorites WHERE id = ?', [ id ]);

    if (result.rows.length === 0) return null;

    return postProcess(result.rows[0]);
}

async function remove(id) {
    assert.strictEqual(typeof id, 'string');

    debugLog(`remove: ${id}`);

    await database.query('DELETE FROM favorites WHERE id = ?', [ id ]);
}

async function removeByOwnerAndPath(owner, filePath, isDirectory) {
    assert.strictEqual(typeof owner, 'string');
    assert.strictEqual(typeof filePath, 'string');
    assert.strictEqual(typeof isDirectory, 'boolean');

    const { ownerUserId, ownerGroupfolder } = sqlutil.ownerToDbColumns(owner);

    debugLog(`removeByOwnerAndPath: ${owner}${filePath} isDirectory:${isDirectory}`);

    const { sql: pathCondition, args: pathArgs } = sqlutil.pathCondition(filePath, isDirectory);

    await database.query(`DELETE FROM favorites WHERE share_id IS NULL AND (owner_user_id = ? OR owner_groupfolder = ?) AND ${pathCondition}`, [
        ownerUserId, ownerGroupfolder, ...pathArgs
    ]);

    // share-based favorites whose share survives but whose resolved path falls
    // inside the deleted path. (The share itself being deleted is handled by
    // the shares.id ON DELETE CASCADE foreign key.)
    const shareFavorites = await database.query(`SELECT f.id, f.file_path, f.share_id, s.file_path AS share_root, s.owner_user_id, s.owner_groupfolder
        FROM favorites f JOIN shares s ON f.share_id = s.id WHERE f.share_id IS NOT NULL`);

    for (const row of shareFavorites.rows) {
        const shareOwner = row.owner_groupfolder ? `groupfolder-${row.owner_groupfolder}` : row.owner_user_id;
        if (shareOwner !== owner) continue;

        const canonicalPath = canonicalFromShareFavorite(row.share_root, row.file_path);
        if (!pathAffected(canonicalPath, filePath, isDirectory)) continue;

        await database.query('DELETE FROM favorites WHERE id = ?', [ row.id ]);
    }
}

function relativeFromCanonical(shareRoot, canonicalPath) {
    if (canonicalPath === shareRoot) return '/';
    return canonicalPath.slice(shareRoot.length) || '/';
}

function pathAffected(filePath, fromPath, isDirectory) {
    if (isDirectory) return filePath === fromPath || filePath.startsWith(fromPath + '/');
    return filePath === fromPath;
}

function relocatedPath(filePath, fromPath, toPath, isDirectory) {
    if (!pathAffected(filePath, fromPath, isDirectory)) return filePath;
    if (isDirectory) return toPath + filePath.slice(fromPath.length);
    return toPath;
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

    await database.query(`UPDATE favorites SET owner_user_id = ?, owner_groupfolder = ?, file_path = ? || substr(file_path, length(?) + 1)
        WHERE share_id IS NULL AND (owner_user_id = ? OR owner_groupfolder = ?) AND ${pathCondition}`, [
        to.ownerUserId, to.ownerGroupfolder, toPath, fromPath, from.ownerUserId, from.ownerGroupfolder, ...pathArgs
    ]);

    const shareFavorites = await database.query(`SELECT f.id, f.file_path, f.share_id, s.file_path AS share_root, s.owner_user_id, s.owner_groupfolder
        FROM favorites f JOIN shares s ON f.share_id = s.id WHERE f.share_id IS NOT NULL`);

    for (const row of shareFavorites.rows) {
        const shareOwner = row.owner_groupfolder ? `groupfolder-${row.owner_groupfolder}` : row.owner_user_id;
        if (shareOwner !== fromOwner) continue;

        const canonicalPath = canonicalFromShareFavorite(row.share_root, row.file_path);
        if (!pathAffected(canonicalPath, fromPath, isDirectory)) continue;

        const newCanonicalPath = relocatedPath(canonicalPath, fromPath, toPath, isDirectory);
        const share = await shares.get(row.share_id);
        if (!share) continue;

        const newRelativePath = relativeFromCanonical(share.filePath, newCanonicalPath);
        await database.query('UPDATE favorites SET file_path = ? WHERE id = ?', [ newRelativePath, row.id ]);
    }
}

export default {
    listByOwnerAndFilePath,
    listByShareAndFilePath,
    attachToShareTree,
    list,
    get,
    create,
    remove,
    removeByOwnerAndPath,
    relocatePaths
};
