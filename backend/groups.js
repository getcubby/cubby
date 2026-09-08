import assert from 'assert';
import debug from 'debug';
import database from './database.js';
import MainError from './mainerror.js';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:groups');

const SOURCES = {
    SCIM: 'scim'
};

function postProcess(group) {
    return group;
}

async function get(id) {
    assert.strictEqual(typeof id, 'string');

    const result = await database.query('SELECT * FROM groups WHERE id = $1', [ id ]);
    if (result.rows.length === 0) return null;

    return postProcess(result.rows[0]);
}

async function list() {
    const result = await database.query('SELECT * FROM groups ORDER BY name');

    result.rows.forEach(postProcess);

    return result.rows;
}

async function getMemberUsernames(groupId) {
    assert.strictEqual(typeof groupId, 'string');

    const result = await database.query('SELECT username FROM group_members WHERE group_id = $1 ORDER BY username', [ groupId ]);

    return result.rows.map((m) => m.username);
}

async function getMembershipGroupIds(username) {
    assert.strictEqual(typeof username, 'string');

    const result = await database.query('SELECT group_id FROM group_members WHERE username = $1 ORDER BY group_id', [ username ]);

    return result.rows.map((m) => m.group_id);
}

async function listWithMembers() {
    const groups = await list();

    for (const group of groups) {
        group.members = await getMemberUsernames(group.id);
    }

    return groups;
}

async function add(group) {
    assert.strictEqual(typeof group, 'object');
    assert.strictEqual(typeof group.id, 'string');
    assert.strictEqual(typeof group.name, 'string');

    const source = group.source || '';

    const [error] = await safe(database.query('INSERT INTO groups (id, name, source) VALUES ($1, $2, $3)', [ group.id, group.name, source ]));
    if (error?.nestedError?.constraint === 'groups_pkey') throw new MainError(MainError.ALREADY_EXISTS, 'group already exists');
    if (error) throw error;
}

async function update(id, name) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof name, 'string');

    await database.query('UPDATE groups SET name = $1 WHERE id = $2', [ name, id ]);
}

async function setMembers(groupId, usernames) {
    assert.strictEqual(typeof groupId, 'string');
    assert(Array.isArray(usernames));

    const queries = [{
        query: 'DELETE FROM group_members WHERE group_id = $1',
        args: [ groupId ]
    }];

    for (const username of usernames) {
        queries.push({
            query: 'INSERT INTO group_members (group_id, username) VALUES ($1, $2)',
            args: [ groupId, username ]
        });
    }

    const [error] = await safe(database.transaction(queries));
    if (error?.nestedError?.constraint === 'group_members_username_fkey') throw new MainError(MainError.NOT_FOUND, 'user not found');
    if (error?.nestedError?.constraint === 'group_members_group_id_fkey') throw new MainError(MainError.NOT_FOUND, 'group not found');
    if (error) throw error;
}

async function remove(id) {
    assert.strictEqual(typeof id, 'string');

    const queries = [{
        query: 'DELETE FROM group_members WHERE group_id = $1',
        args: [ id ]
    }, {
        query: 'DELETE FROM groups WHERE id = $1',
        args: [ id ]
    }];

    await database.transaction(queries);
}

/**
 * Create or update a group synced from Cloudron SCIM.
 * @param {string} id
 * @param {string} name
 * @param {string[]} memberUsernames
 * @returns {Promise<{ created: boolean, updated: boolean }>}
 */
async function upsertFromScim(id, name, memberUsernames) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof name, 'string');
    assert(Array.isArray(memberUsernames));

    debugLog(`upsertFromScim: ${id} ${name} members:${memberUsernames.length}`);

    if (await get(id)) {
        await update(id, name);
        await setMembers(id, memberUsernames);
        return { created: false, updated: true };
    }

    const [error] = await safe(add({ id, name, source: SOURCES.SCIM }));
    if (error && error.reason !== MainError.ALREADY_EXISTS) throw error;
    if (error && error.reason === MainError.ALREADY_EXISTS) {
        await update(id, name);
    }

    await setMembers(id, memberUsernames);

    return { created: true, updated: false };
}

export default {
    SOURCES,
    get,
    list,
    listWithMembers,
    getMemberUsernames,
    getMembershipGroupIds,
    add,
    update,
    setMembers,
    remove,
    upsertFromScim
};
