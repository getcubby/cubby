import assert from 'assert';
import debug from 'debug';
import files from './files.js';
import shares from './shares.js';
import database from './database.js';
import path from 'path';

const debugLog = debug('cubby:recent');

const MAX_AGE = 60 * 24 * 60 * 60 * 1000; // ~2 months

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

    data.accessedAt = data.accessed_at;
    delete data.accessed_at;

    if (data.owner_groupfolder) data.owner = `groupfolder-${data.owner_groupfolder}`;
    else data.owner = data.owner_username;
    delete data.owner_username;
    delete data.owner_groupfolder;

    return data;
}

function resourcePathToRef(resourcePath, opener) {
    resourcePath = resourcePath.replace(/\/+/g, '/');

    if (resourcePath.indexOf('/home') === 0) {
        return {
            shareId: null,
            ownerUsername: opener,
            ownerGroupfolder: null,
            filePath: resourcePath.slice('/home'.length) || '/'
        };
    }

    if (resourcePath.indexOf('/shares/') === 0) {
        const parts = resourcePath.slice(1).split('/');
        const shareId = parts[1];
        if (!shareId) return null;
        const rest = parts.slice(2).join('/');

        return {
            shareId,
            ownerUsername: null,
            ownerGroupfolder: null,
            filePath: rest ? '/' + rest : '/'
        };
    }

    if (resourcePath.indexOf('/groupfolders/') === 0) {
        const parts = resourcePath.slice(1).split('/');
        const groupId = parts[1];
        if (!groupId) return null;
        const rest = parts.slice(2).join('/');

        return {
            shareId: null,
            ownerUsername: null,
            ownerGroupfolder: groupId,
            filePath: rest ? '/' + rest : '/'
        };
    }

    return null;
}

function canonicalFromShareFavorite(shareRoot, filePath) {
    if (filePath === '/') return shareRoot;
    return path.posix.join(shareRoot, filePath);
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

async function touch(opener, ref) {
    if (ref.shareId) {
        const updated = await database.query('UPDATE recents SET accessed_at = CURRENT_TIMESTAMP WHERE opener = $1 AND share_id = $2 AND file_path = $3', [
            opener, ref.shareId, ref.filePath
        ]);
        if (updated.rowCount > 0) return;

        await database.query('INSERT INTO recents (opener, share_id, owner_username, owner_groupfolder, file_path, accessed_at) VALUES ($1, $2, NULL, NULL, $3, CURRENT_TIMESTAMP)', [
            opener, ref.shareId, ref.filePath
        ]);
        return;
    }

    const updated = await database.query('UPDATE recents SET accessed_at = CURRENT_TIMESTAMP WHERE opener = $1 AND share_id IS NULL AND owner_username IS NOT DISTINCT FROM $2 AND owner_groupfolder IS NOT DISTINCT FROM $3 AND file_path = $4', [
        opener, ref.ownerUsername, ref.ownerGroupfolder, ref.filePath
    ]);
    if (updated.rowCount > 0) return;

    await database.query('INSERT INTO recents (opener, share_id, owner_username, owner_groupfolder, file_path, accessed_at) VALUES ($1, NULL, $2, $3, $4, CURRENT_TIMESTAMP)', [
        opener, ref.ownerUsername, ref.ownerGroupfolder, ref.filePath
    ]);
}

async function add(opener, resourcePath) {
    assert.strictEqual(typeof opener, 'string');
    assert.strictEqual(typeof resourcePath, 'string');

    const ref = resourcePathToRef(resourcePath, opener);
    if (!ref) return;

    debugLog(`add: ${opener} share:${ref.shareId || 'none'} ${ref.filePath}`);

    await touch(opener, ref);
}

async function remove(opener, resourcePath) {
    assert.strictEqual(typeof opener, 'string');
    assert.strictEqual(typeof resourcePath, 'string');

    const ref = resourcePathToRef(resourcePath, opener);
    if (!ref) return;

    debugLog(`remove: ${opener} share:${ref.shareId || 'none'} ${ref.filePath}`);

    if (ref.shareId) {
        await database.query('DELETE FROM recents WHERE opener = $1 AND share_id = $2 AND file_path = $3', [ opener, ref.shareId, ref.filePath ]);
        return;
    }

    await database.query('DELETE FROM recents WHERE opener = $1 AND share_id IS NULL AND owner_username IS NOT DISTINCT FROM $2 AND owner_groupfolder IS NOT DISTINCT FROM $3 AND file_path = $4', [
        opener, ref.ownerUsername, ref.ownerGroupfolder, ref.filePath
    ]);
}

async function list(opener, daysAgo = 10, maxFiles = 100) {
    assert.strictEqual(typeof opener, 'string');
    assert.strictEqual(typeof daysAgo, 'number');
    assert.strictEqual(typeof maxFiles, 'number');

    debugLog(`list: ${opener} maxFiles:${maxFiles}`);

    const now = Date.now();
    const result = [];

    const rows = await database.query('SELECT * FROM recents WHERE opener = $1 ORDER BY accessed_at DESC', [ opener ]);

    for (const row of rows.rows) {
        const recent = postProcess(row);
        if (now - recent.accessedAt.getTime() > MAX_AGE) break;
        if (result.length >= maxFiles) break;

        result.push(recent);
    }

    return result;
}

async function purge() {
    await database.query('DELETE FROM recents WHERE accessed_at < NOW() - INTERVAL \'60 days\'');
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

    await database.query(`UPDATE recents SET owner_username = $4, owner_groupfolder = $5, file_path = $6 || substring(file_path FROM length($3) + 1)
        WHERE share_id IS NULL AND (owner_username = $1 OR owner_groupfolder = $2) AND ${pathCondition}`, [
        from.ownerUsername, from.ownerGroupfolder, fromPath, to.ownerUsername, to.ownerGroupfolder, toPath
    ]);

    const shareRecents = await database.query(`SELECT r.opener, r.file_path, r.share_id, s.file_path AS share_root, s.owner_username, s.owner_groupfolder
        FROM recents r JOIN shares s ON r.share_id = s.id WHERE r.share_id IS NOT NULL`);

    for (const row of shareRecents.rows) {
        const shareOwner = row.owner_groupfolder ? `groupfolder-${row.owner_groupfolder}` : row.owner_username;
        if (shareOwner !== fromOwner) continue;

        const canonicalPath = canonicalFromShareFavorite(row.share_root, row.file_path);
        if (!pathAffected(canonicalPath, fromPath, isDirectory)) continue;

        const newCanonicalPath = relocatedPath(canonicalPath, fromPath, toPath, isDirectory);
        const share = await shares.get(row.share_id);
        if (!share) continue;

        const newRelativePath = relativeFromCanonical(share.filePath, newCanonicalPath);
        await database.query('UPDATE recents SET file_path = $1 WHERE opener = $2 AND share_id = $3 AND file_path = $4', [
            newRelativePath, row.opener, row.share_id, row.file_path
        ]);
    }
}

export default {
    add,
    remove,
    list,
    purge,
    relocatePaths
};
