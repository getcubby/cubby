import assert from 'assert';
import constants from './constants.js';
import paths from './paths.js';
import crypto from 'crypto';
import debug from 'debug';
import database from './database.js';
import fs from 'fs';
import fsPromises from 'fs/promises';
import groups from './groups.js';
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

const ROLE_PRIORITY = {
    [ROLES.OWNER]: 3,
    [ROLES.EDITOR]: 2,
    [ROLES.VIEWER]: 1
};

function isValidRole(role) {
    return role === ROLES.OWNER || role === ROLES.EDITOR || role === ROLES.VIEWER;
}

// returns the more permissive of two roles (owner > editor > viewer)
function higherRole(a, b) {
    if (!a) return b;
    if (!b) return a;
    return ROLE_PRIORITY[a] >= ROLE_PRIORITY[b] ? a : b;
}

async function getMembers(id) {
    assert.strictEqual(typeof id, 'string');

    const result = await database.query('SELECT username, role FROM groupfolders_members WHERE groupfolder_id = ? ORDER BY username', [ id ]);
    return result.rows.map((m) => ({ username: m.username, role: m.role }));
}

async function getGroupMembers(id) {
    assert.strictEqual(typeof id, 'string');

    const result = await database.query('SELECT group_id, role FROM groupfolders_group_members WHERE groupfolder_id = ? ORDER BY group_id', [ id ]);
    return result.rows.map((m) => ({ groupId: m.group_id, role: m.role }));
}

// all usernames that are members (directly or via a group)
async function getMemberUsernames(id) {
    assert.strictEqual(typeof id, 'string');

    const usernames = new Set();
    for (const member of await getMembers(id)) usernames.add(member.username);
    for (const groupMember of await getGroupMembers(id)) {
        for (const username of await groups.getMemberUsernames(groupMember.groupId)) usernames.add(username);
    }
    return Array.from(usernames);
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
        query: 'INSERT INTO groupfolders (id, name) VALUES (?, ?)',
        args: [ idOrSlug, name ]
    }, {
        query: 'INSERT INTO groupfolders_members (groupfolder_id, username, role) VALUES (?, ?, ?)',
        args: [ idOrSlug, ownerUsername, ROLES.OWNER ]
    }];

    const [error] = await safe(database.transaction(queries));
    if (error?.nestedError?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') throw new MainError(MainError.NOT_FOUND, 'user not found');
    if (error?.nestedError?.code && [ 'SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY' ].includes(error.nestedError.code)) throw new MainError(MainError.ALREADY_EXISTS, 'groupFolder already exists');
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

    const result = await database.query('SELECT * FROM groupfolders WHERE id = ?', [ id ]);
    if (result.rows.length === 0) return null;

    const groupFolder = result.rows[0];
    groupFolder.members = await getMembers(id);
    groupFolder.groupMembers = await getGroupMembers(id);

    return groupFolder;
}

async function list(username = '') {
    assert.strictEqual(typeof username, 'string');

    const result = await database.query('SELECT * FROM groupfolders ORDER BY name');

    const folders = result.rows;
    for (const folder of folders) {
        folder.members = await getMembers(folder.id);
        folder.groupMembers = await getGroupMembers(folder.id);
    }

    if (!username) return folders;

    // a user is part of a groupfolder if they are a direct member or in a member group
    const accessible = [];
    for (const folder of folders) {
        if (await isPartOf(folder, username)) accessible.push(folder);
    }

    return accessible;
}

async function update(id, name, members, groupMembers = []) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof name, 'string');
    assert(Array.isArray(members));
    assert(Array.isArray(groupMembers));

    debugLog(`update: ${id} by name ${name} with members ${JSON.stringify(members)} groupMembers ${JSON.stringify(groupMembers)}`);

    const queries = [{
        query: 'UPDATE groupfolders set name=? WHERE id=?',
        args: [ name, id ]
    }];

    queries.push({
        query: 'DELETE FROM groupfolders_members WHERE groupfolder_id=?',
        args: [ id ]
    });

    for (const member of members) {
        queries.push({
            query: 'INSERT INTO groupfolders_members (groupfolder_id, username, role) VALUES (?, ?, ?)',
            args: [ id, member.username, member.role ]
        });
    }

    queries.push({
        query: 'DELETE FROM groupfolders_group_members WHERE groupfolder_id=?',
        args: [ id ]
    });

    for (const groupMember of groupMembers) {
        queries.push({
            query: 'INSERT INTO groupfolders_group_members (groupfolder_id, group_id, role) VALUES (?, ?, ?)',
            args: [ id, groupMember.groupId, groupMember.role ]
        });
    }

    const [error] = await safe(database.transaction(queries));
    if (error?.nestedError?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') throw new MainError(MainError.NOT_FOUND, 'user or group not found');
    if (error?.nestedError?.code && [ 'SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY' ].includes(error.nestedError.code)) throw new MainError(MainError.ALREADY_EXISTS, 'groupFolder already exists');
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
        query: 'DELETE FROM groupfolders_members WHERE groupfolder_id = ?',
        args: [ id ]
    }, {
        query: 'DELETE FROM groupfolders_group_members WHERE groupfolder_id = ?',
        args: [ id ]
    }, {
        query: 'DELETE FROM groupfolders WHERE id = ?',
        args: [ id ]
    }];

    await database.transaction(queries);

    // FIXME reindex for all for the moment until we know who got removed!
    recoll.index();
}

async function getRole(groupFolder, username) {
    assert.strictEqual(typeof groupFolder, 'object');
    assert.strictEqual(typeof username, 'string');

    let role = null;

    const member = groupFolder.members.find((m) => m.username === username);
    if (member) role = member.role;

    // resolve group-derived roles, most permissive wins
    const membershipGroupIds = new Set(await groups.getMembershipGroupIds(username));
    for (const groupMember of groupFolder.groupMembers) {
        if (!membershipGroupIds.has(groupMember.groupId)) continue;
        role = higherRole(role, groupMember.role);
    }

    return role;
}

async function isPartOf(groupFolder, username) {
    return await getRole(groupFolder, username) !== null;
}

async function isOwner(groupFolder, username) {
    return await getRole(groupFolder, username) === ROLES.OWNER;
}

export default {
    ROLES,
    isValidRole,
    add,
    get,
    list,
    update,
    remove,

    getMembers,
    getGroupMembers,
    getMemberUsernames,
    getRole,
    isPartOf,
    isOwner
};
