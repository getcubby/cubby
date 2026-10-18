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

    const result = await database.query(`SELECT groupfolders_members.user_id, groupfolders_members.role, users.username, users.active
        FROM groupfolders_members
        LEFT JOIN users ON users.id = groupfolders_members.user_id
        WHERE groupfolders_members.groupfolder_id = ?
        ORDER BY users.username`, [ id ]);
    return result.rows.map((m) => ({ userId: m.user_id, username: m.username || '', role: m.role, active: !!m.active }));
}

async function getGroupMembers(id) {
    assert.strictEqual(typeof id, 'string');

    const result = await database.query(`SELECT groupfolders_group_members.group_id, groupfolders_group_members.role, groups.name, groups.active
        FROM groupfolders_group_members
        LEFT JOIN groups ON groups.id = groupfolders_group_members.group_id
        WHERE groupfolders_group_members.groupfolder_id = ?
        ORDER BY groupfolders_group_members.group_id`, [ id ]);
    return result.rows.map((m) => ({ groupId: m.group_id, role: m.role, name: m.name || m.group_id, active: !!m.active }));
}

// all user ids that are members (directly or via a group)
async function getMemberUserIds(id) {
    assert.strictEqual(typeof id, 'string');

    const userIds = new Set();
    for (const member of await getMembers(id)) userIds.add(member.userId);
    for (const groupMember of await getGroupMembers(id)) {
        for (const userId of await groups.getMemberUserIds(groupMember.groupId)) userIds.add(userId);
    }
    return Array.from(userIds);
}

// group ids are like slugs so they are unique and should be humanly readable
async function add(idOrSlug, name, ownerUserId, members = [], groupMembers = []) {
    assert.strictEqual(typeof idOrSlug, 'string');
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof ownerUserId, 'string');
    assert(Array.isArray(members));
    assert(Array.isArray(groupMembers));

    // if no id slug is provided generate one
    if (!idOrSlug) idOrSlug = crypto.randomBytes(6).toString('hex');

    debugLog(`add: ${idOrSlug} by name ${name} with owner ${ownerUserId} members ${JSON.stringify(members)} groupMembers ${JSON.stringify(groupMembers)}`);

    const queries = [{
        query: 'INSERT INTO groupfolders (id, name) VALUES (?, ?)',
        args: [ idOrSlug, name ]
    }, {
        query: 'INSERT INTO groupfolders_members (groupfolder_id, user_id, role) VALUES (?, ?, ?)',
        args: [ idOrSlug, ownerUserId, ROLES.OWNER ]
    }];

    const seen = new Set([ ownerUserId ]);
    for (const member of members) {
        if (seen.has(member.userId)) continue;
        seen.add(member.userId);
        queries.push({
            query: 'INSERT INTO groupfolders_members (groupfolder_id, user_id, role) VALUES (?, ?, ?)',
            args: [ idOrSlug, member.userId, member.role ]
        });
    }

    for (const groupMember of groupMembers) {
        queries.push({
            query: 'INSERT INTO groupfolders_group_members (groupfolder_id, group_id, role) VALUES (?, ?, ?)',
            args: [ idOrSlug, groupMember.groupId, groupMember.role ]
        });
    }

    const [error] = await safe(database.transaction(queries));
    if (error?.nestedError?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') throw new MainError(MainError.NOT_FOUND, 'user or group not found');
    if (error?.nestedError?.code && [ 'SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY' ].includes(error.nestedError.code)) throw new MainError(MainError.ALREADY_EXISTS, 'groupFolder already exists');
    if (error) throw error;

    fs.mkdirSync(path.join(paths.GROUPS_DATA_ROOT, idOrSlug), { recursive: true });

    // kick off indexer in background
    if (!constants.TEST) {
        recoll.indexByUsername(ownerUserId).catch((error) => console.error('Search index update failed:', error));
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

async function list(userId = '') {
    assert.strictEqual(typeof userId, 'string');

    const result = await database.query('SELECT * FROM groupfolders ORDER BY name');

    const folders = result.rows;
    for (const folder of folders) {
        folder.members = await getMembers(folder.id);
        folder.groupMembers = await getGroupMembers(folder.id);
    }

    if (!userId) return folders;

    // a user is part of a groupfolder if they are a direct member or in a member group
    const accessible = [];
    for (const folder of folders) {
        if (await isPartOf(folder, userId)) accessible.push(folder);
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
            query: 'INSERT INTO groupfolders_members (groupfolder_id, user_id, role) VALUES (?, ?, ?)',
            args: [ id, member.userId, member.role ]
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
    recoll.index().catch((error) => console.error('Search index update failed:', error));
}

async function remove(id) {
    assert.strictEqual(typeof id, 'string');

    const groupFolderPath = path.join(paths.GROUPS_DATA_ROOT, id);

    debugLog(`remove: ${id} and folder at ${groupFolderPath}`);

    // move the files aside first so that a failure leaves both the files and the database untouched
    const trashPath = path.join(paths.GROUPS_DATA_ROOT, `.deleted-${id}-${crypto.randomBytes(4).toString('hex')}`);
    const [renameError] = await safe(fsPromises.rename(groupFolderPath, trashPath));
    if (renameError && renameError.code !== 'ENOENT') throw new MainError(MainError.FS_ERROR, renameError);

    // rows referencing the group folder have no ON DELETE CASCADE. favorites and recents of its shares cascade with the shares
    const queries = [
        'DELETE FROM favorites WHERE owner_groupfolder = ?',
        'DELETE FROM recents WHERE owner_groupfolder = ?',
        'DELETE FROM shares WHERE owner_groupfolder = ?',
        'DELETE FROM filedrops WHERE owner_groupfolder = ?',
        'DELETE FROM file_activity WHERE owner_groupfolder = ?',
        'DELETE FROM groupfolders_members WHERE groupfolder_id = ?',
        'DELETE FROM groupfolders_group_members WHERE groupfolder_id = ?',
        'DELETE FROM groupfolders WHERE id = ?'
    ].map(query => ({ query, args: [ id ] }));

    const [dbError] = await safe(database.transaction(queries));
    if (dbError) {
        if (!renameError) await safe(fsPromises.rename(trashPath, groupFolderPath));
        throw dbError;
    }

    const [rmError] = await safe(fsPromises.rm(trashPath, { recursive: true, force: true }));
    if (rmError) console.error(`remove: failed to remove files of group folder ${id} at ${trashPath}`, rmError);

    // FIXME reindex for all for the moment until we know who got removed!
    recoll.index().catch((error) => console.error('Search index update failed:', error));
}

async function getRole(groupFolder, userId) {
    assert.strictEqual(typeof groupFolder, 'object');
    assert.strictEqual(typeof userId, 'string');

    let role = null;

    const member = groupFolder.members.find((m) => m.userId === userId);
    if (member) role = member.role;

    // resolve group-derived roles, most permissive wins
    const membershipGroupIds = new Set(await groups.getMembershipGroupIds(userId));
    for (const groupMember of groupFolder.groupMembers) {
        if (!membershipGroupIds.has(groupMember.groupId)) continue;
        role = higherRole(role, groupMember.role);
    }

    return role;
}

async function isPartOf(groupFolder, userId) {
    return await getRole(groupFolder, userId) !== null;
}

async function isOwner(groupFolder, userId) {
    return await getRole(groupFolder, userId) === ROLES.OWNER;
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
    getMemberUserIds,
    getRole,
    isPartOf,
    isOwner
};
