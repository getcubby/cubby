import assert from 'assert';
import constants from './constants.js';
import paths from './paths.js';
import crypto from 'crypto';
import debug from 'debug';
import database from './database.js';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import MainError from './mainerror.js';
import recoll from './recoll.js';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:groupfolders');

const ROLES = {
    OWNER: 'owner',
    EDITOR: 'editor',
    VIEWER: 'viewer'
};

function isValidRole(role) {
    return role === ROLES.OWNER || role === ROLES.EDITOR || role === ROLES.VIEWER;
}

async function getMembers(id) {
    assert.strictEqual(typeof id, 'string');

    const result = await database.query('SELECT username, role FROM groupfolders_members WHERE groupfolder_id = $1 ORDER BY username', [ id ]);
    return result.rows.map((m) => ({ username: m.username, role: m.role }));
}

// group ids are like slugs so they are unique and should be humanly readable
async function add(idOrSlug, name, ownerUsername) {
    assert.strictEqual(typeof idOrSlug, 'string');
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof ownerUsername, 'string');

    // if no id slug is provided generate one
    if (!idOrSlug) idOrSlug = crypto.randomBytes(6).toString('hex');

    debugLog(`add: ${idOrSlug} by name ${name} with owner ${ownerUsername}`);

    const queries = [{
        query: 'INSERT INTO groupfolders (id, name) VALUES ($1, $2)',
        args: [ idOrSlug, name ]
    }, {
        query: 'INSERT INTO groupfolders_members (groupfolder_id, username, role) VALUES ($1, $2, $3)',
        args: [ idOrSlug, ownerUsername, ROLES.OWNER ]
    }];

    const [error] = await safe(database.transaction(queries));
    if (error?.nestedError?.constraint === 'groupfolders_members_username_fkey') throw new MainError(MainError.NOT_FOUND, 'user not found');
    if (error?.nestedError?.constraint === 'groupfolders_pkey') throw new MainError(MainError.ALREADY_EXISTS, 'groupFolder already exists');
    if (error) throw error;

    fs.mkdirSync(path.join(paths.GROUPS_DATA_ROOT, idOrSlug), { recursive: true });

    // kick off indexer in background
    if (!constants.TEST) {
        recoll.indexByUsername(ownerUsername);
    }
}

async function get(id) {
    assert.strictEqual(typeof id, 'string');

    debugLog(`get: ${id}`);

    let result = await database.query('SELECT * FROM groupfolders WHERE id = $1', [ id ]);
    if (result.rows.length === 0) return null;

    const groupFolder = result.rows[0];
    groupFolder.members = await getMembers(id);

    return groupFolder;
}

async function list(username = '') {
    assert.strictEqual(typeof username, 'string');

    let query = 'SELECT groupfolders.* FROM groupfolders';
    const args = [];

    if (username) {
        query = `${query} LEFT OUTER JOIN groupfolders_members ON groupfolders.id = groupfolders_members.groupfolder_id WHERE groupfolders_members.username = $1`;
        args.push(username);
    }

    const result = await database.query(query, args);
    const folders = result.rows;

    for (const folder of folders) {
        folder.members = await getMembers(folder.id);
    }

    return folders;
}

async function update(id, name, members) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof name, 'string');
    assert(Array.isArray(members));

    debugLog(`update: ${id} by name ${name} with members ${JSON.stringify(members)}`);

    const queries = [{
        query: 'UPDATE groupfolders set name=$1 WHERE id=$2',
        args: [ name, id ]
    }];

    queries.push({
        query: 'DELETE FROM groupfolders_members WHERE groupfolder_id=$1',
        args: [ id ]
    });

    for (const member of members) {
        queries.push({
            query: 'INSERT INTO groupfolders_members (groupfolder_id, username, role) VALUES ($1, $2, $3)',
            args: [ id, member.username, member.role ]
        });
    }

    const [error] = await safe(database.transaction(queries));
    if (error?.nestedError?.constraint === 'groupfolders_members_username_fkey') throw new MainError(MainError.NOT_FOUND, 'user not found');
    if (error?.nestedError?.constraint === 'groupfolders_pkey') throw new MainError(MainError.ALREADY_EXISTS, 'groupFolder already exists');
    if (error) throw error;

    // FIXME reindex for all for the moment until we know who got removed!
    recoll.index();
}

async function remove(id) {
    assert.strictEqual(typeof id, 'string');

    const groupFolderPath = path.join(paths.GROUPS_DATA_ROOT, id);

    debugLog(`remove: ${id} and folder at ${groupFolderPath}`);

    const [rmError] = await safe(fsPromises.rm(groupFolderPath, { recursive: true }));
    if (rmError) throw new MainError(MainError.FS_ERROR, rmError);

    const queries = [{
        query: 'DELETE FROM groupfolders_members WHERE groupfolder_id = $1',
        args: [ id ]
    }, {
        query: 'DELETE FROM groupfolders WHERE id = $1',
        args: [ id ]
    }];

    await database.transaction(queries);

    // FIXME reindex for all for the moment until we know who got removed!
    recoll.index();
}

function getRole(groupFolder, username) {
    assert.strictEqual(typeof groupFolder, 'object');
    assert.strictEqual(typeof username, 'string');

    const member = groupFolder.members.find((m) => m.username === username);
    return member ? member.role : null;
}

function isPartOf(groupFolder, username) {
    return getRole(groupFolder, username) !== null;
}

function isOwner(groupFolder, username) {
    return getRole(groupFolder, username) === ROLES.OWNER;
}

export default {
    ROLES,
    isValidRole,
    add,
    get,
    list,
    update,
    remove,

    getRole,
    isPartOf,
    isOwner
};
