import assert from 'assert';
import debug from 'debug';
import files from './files.js';
import shares from './shares.js';
import database from './database.js';
import crypto from 'crypto';
import path from 'path';
import MainError from './mainerror.js';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:favorites');

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

    data.shareId = data.share_id;
    delete data.share_id;

    data.createdAt = data.created_at;
    delete data.created_at;

    if (data.owner_groupfolder) data.owner = `groupfolder-${data.owner_groupfolder}`;
    else data.owner = data.owner_username;
    delete data.owner_username;
    delete data.owner_groupfolder;

    return data;
}

async function listByOwnerAndFilePath(owner, filePath) {
    assert(typeof owner === 'string');
    assert(typeof filePath === 'string');

    const { ownerUsername, ownerGroupfolder } = ownerToDbColumns(owner);

    debugLog(`listByOwnerAndFilePath: ${owner} ${filePath}`);

    const result = await database.query('SELECT * FROM favorites WHERE share_id IS NULL AND (owner_username = $1 OR owner_groupfolder = $2) AND file_path = $3', [ ownerUsername, ownerGroupfolder, filePath ]);

    result.rows.forEach(postProcess);

    return result.rows;
}

async function listByShareAndFilePath(shareId, filePath) {
    assert(typeof shareId === 'string');
    assert(typeof filePath === 'string');

    debugLog(`listByShareAndFilePath: ${shareId} ${filePath}`);

    const result = await database.query('SELECT * FROM favorites WHERE share_id = $1 AND file_path = $2', [ shareId, filePath ]);

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

    const result = await database.query('SELECT * FROM favorites WHERE username = $1 ORDER BY created_at DESC', [ username ]);

    result.rows.forEach(postProcess);

    return result.rows;
}

async function findExistingId(username, { shareId, ownerUsername, ownerGroupfolder, filePath }) {
    if (shareId) {
        const result = await database.query('SELECT id FROM favorites WHERE username = $1 AND share_id = $2 AND file_path = $3', [ username, shareId, filePath ]);
        return result.rows[0]?.id || null;
    }

    const result = await database.query('SELECT id FROM favorites WHERE username = $1 AND share_id IS NULL AND owner_username IS NOT DISTINCT FROM $2 AND owner_groupfolder IS NOT DISTINCT FROM $3 AND file_path = $4', [
        username, ownerUsername, ownerGroupfolder, filePath
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

    let ownerUsername = null;
    let ownerGroupfolder = null;

    if (shareId) {
        const share = await shares.get(shareId);
        if (!share) throw new MainError(MainError.NOT_FOUND);

        const shareOwner = share.ownerUsername || `groupfolder-${share.ownerGroupfolder}`;
        const canonicalPath = canonicalFromShareFavorite(share.filePath, filePath);
        const fullFilePath = files.getAbsolutePath(shareOwner, canonicalPath);
        if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);
    } else {
        assert(typeof owner === 'string');

        const ownerColumns = ownerToDbColumns(owner);
        ownerUsername = ownerColumns.ownerUsername;
        ownerGroupfolder = ownerColumns.ownerGroupfolder;

        const fullFilePath = files.getAbsolutePath(owner, filePath);
        if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);
    }

    const existingId = await findExistingId(username, { shareId, ownerUsername, ownerGroupfolder, filePath });
    if (existingId) return existingId;

    const id = crypto.randomUUID();

    const [error] = await safe(database.query('INSERT INTO favorites (id, username, share_id, owner_username, owner_groupfolder, file_path) VALUES ($1, $2, $3, $4, $5, $6)', [
        id, username, shareId, ownerUsername, ownerGroupfolder, filePath
    ]));
    if (error) {
        const retryId = await findExistingId(username, { shareId, ownerUsername, ownerGroupfolder, filePath });
        if (retryId) return retryId;
        throw new MainError(MainError.BAD_STATE, error);
    }

    return id;
}

async function get(id) {
    assert.strictEqual(typeof id, 'string');

    debugLog(`get: ${id}`);

    const result = await database.query('SELECT * FROM favorites WHERE id = $1', [ id ]);

    if (result.rows.length === 0) return null;

    return postProcess(result.rows[0]);
}

async function remove(id) {
    assert.strictEqual(typeof id, 'string');

    debugLog(`remove: ${id}`);

    await database.query('DELETE FROM favorites WHERE id = $1', [ id ]);
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

    const from = ownerToDbColumns(fromOwner);
    const to = ownerToDbColumns(toOwner);

    debugLog(`relocatePaths: ${fromOwner}${fromPath} -> ${toOwner}${toPath} isDirectory:${isDirectory}`);

    const pathCondition = isDirectory ? '(file_path = $3 OR file_path LIKE $3 || \'/%\')' : 'file_path = $3';

    await database.query(`UPDATE favorites SET owner_username = $4, owner_groupfolder = $5, file_path = $6 || substring(file_path FROM length($3) + 1)
        WHERE share_id IS NULL AND (owner_username = $1 OR owner_groupfolder = $2) AND ${pathCondition}`, [
        from.ownerUsername, from.ownerGroupfolder, fromPath, to.ownerUsername, to.ownerGroupfolder, toPath
    ]);

    const shareFavorites = await database.query(`SELECT f.id, f.file_path, f.share_id, s.file_path AS share_root, s.owner_username, s.owner_groupfolder
        FROM favorites f JOIN shares s ON f.share_id = s.id WHERE f.share_id IS NOT NULL`);

    for (const row of shareFavorites.rows) {
        const shareOwner = row.owner_groupfolder ? `groupfolder-${row.owner_groupfolder}` : row.owner_username;
        if (shareOwner !== fromOwner) continue;

        const canonicalPath = canonicalFromShareFavorite(row.share_root, row.file_path);
        if (!pathAffected(canonicalPath, fromPath, isDirectory)) continue;

        const newCanonicalPath = relocatedPath(canonicalPath, fromPath, toPath, isDirectory);
        const share = await shares.get(row.share_id);
        if (!share) continue;

        const newRelativePath = relativeFromCanonical(share.filePath, newCanonicalPath);
        await database.query('UPDATE favorites SET file_path = $1 WHERE id = $2', [ newRelativePath, row.id ]);
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
    relocatePaths
};
