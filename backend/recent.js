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
    // delete-then-insert so each touch gets a fresh rowid, which keeps "most
    // recently accessed" ordering deterministic even when two touches happen
    // within the same millisecond (SQLite timestamps have ms precision).
    if (ref.shareId) {
        await database.transaction([{
            query: 'DELETE FROM recents WHERE opener = ? AND share_id = ? AND file_path = ?',
            args: [ opener, ref.shareId, ref.filePath ]
        }, {
            query: `INSERT INTO recents (opener, share_id, owner_username, owner_groupfolder, file_path, accessed_at) VALUES (?, ?, NULL, NULL, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
            args: [ opener, ref.shareId, ref.filePath ]
        }]);
        return;
    }

    await database.transaction([{
        query: 'DELETE FROM recents WHERE opener = ? AND share_id IS NULL AND owner_username IS ? AND owner_groupfolder IS ? AND file_path = ?',
        args: [ opener, ref.ownerUsername, ref.ownerGroupfolder, ref.filePath ]
    }, {
        query: `INSERT INTO recents (opener, share_id, owner_username, owner_groupfolder, file_path, accessed_at) VALUES (?, NULL, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
        args: [ opener, ref.ownerUsername, ref.ownerGroupfolder, ref.filePath ]
    }]);
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
        await database.query('DELETE FROM recents WHERE opener = ? AND share_id = ? AND file_path = ?', [ opener, ref.shareId, ref.filePath ]);
        return;
    }

    await database.query('DELETE FROM recents WHERE opener = ? AND share_id IS NULL AND owner_username IS ? AND owner_groupfolder IS ? AND file_path = ?', [
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

    const rows = await database.query('SELECT * FROM recents WHERE opener = ? ORDER BY accessed_at DESC, rowid DESC', [ opener ]);

    for (const row of rows.rows) {
        const recent = postProcess(row);
        if (now - new Date(recent.accessedAt).getTime() > MAX_AGE) break;
        if (result.length >= maxFiles) break;

        result.push(recent);
    }

    return result;
}

async function purge() {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await database.query('DELETE FROM recents WHERE accessed_at < ?', [ cutoff ]);
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

    await database.query(`UPDATE recents SET owner_username = ?, owner_groupfolder = ?, file_path = ? || substr(file_path, length(?) + 1)
        WHERE share_id IS NULL AND (owner_username = ? OR owner_groupfolder = ?) AND ${pathCondition}`, [
        to.ownerUsername, to.ownerGroupfolder, toPath, fromPath, from.ownerUsername, from.ownerGroupfolder, ...pathArgs
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
        await database.query('UPDATE recents SET file_path = ? WHERE opener = ? AND share_id = ? AND file_path = ?', [
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
