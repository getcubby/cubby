import assert from 'assert';
import debug from 'debug';
import database from './database.js';
import MainError from './mainerror.js';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:groups');

function postProcess(group) {
    group.active = !!group.active;

    return group;
}

async function get(id) {
    assert.strictEqual(typeof id, 'string');

    const result = await database.query('SELECT * FROM groups WHERE id = ?', [ id ]);
    if (result.rows.length === 0) return null;

    return postProcess(result.rows[0]);
}

async function list() {
    const result = await database.query('SELECT * FROM groups ORDER BY name');

    result.rows.forEach(postProcess);

    return result.rows;
}

async function getMemberUserIds(groupId) {
    assert.strictEqual(typeof groupId, 'string');

    const result = await database.query('SELECT user_id FROM group_members WHERE group_id = ? ORDER BY user_id', [ groupId ]);

    return result.rows.map((m) => m.user_id);
}

async function getMembers(groupId) {
    assert.strictEqual(typeof groupId, 'string');

    const result = await database.query(`SELECT users.id, users.username
        FROM group_members
        JOIN users ON users.id = group_members.user_id
        WHERE group_members.group_id = ?
        ORDER BY users.username`, [ groupId ]);

    return result.rows.map((m) => ({ id: m.id, username: m.username }));
}

async function getMembershipGroupIds(userId) {
    assert.strictEqual(typeof userId, 'string');

    const result = await database.query('SELECT group_id FROM group_members WHERE user_id = ? ORDER BY group_id', [ userId ]);

    return result.rows.map((m) => m.group_id);
}

async function listWithMembers() {
    const groups = await list();

    for (const group of groups) {
        group.members = await getMembers(group.id);
    }

    return groups;
}

async function add(group) {
    assert.strictEqual(typeof group, 'object');
    assert.strictEqual(typeof group.id, 'string');
    assert.strictEqual(typeof group.name, 'string');

    const [error] = await safe(database.query('INSERT INTO groups (id, name) VALUES (?, ?)', [ group.id, group.name ]));
    if (error?.nestedError?.code && [ 'SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY' ].includes(error.nestedError.code)) throw new MainError(MainError.ALREADY_EXISTS, 'group already exists');
    if (error) throw error;
}

async function update(id, name) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof name, 'string');

    await database.query('UPDATE groups SET name = ? WHERE id = ?', [ name, id ]);
}

async function setActive(id, active) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof active, 'boolean');

    await database.query('UPDATE groups SET active = ? WHERE id = ?', [ active, id ]);
}

async function setMembers(groupId, userIds) {
    assert.strictEqual(typeof groupId, 'string');
    assert(Array.isArray(userIds));

    const queries = [{
        query: 'DELETE FROM group_members WHERE group_id = ?',
        args: [ groupId ]
    }];

    for (const userId of userIds) {
        queries.push({
            query: 'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
            args: [ groupId, userId ]
        });
    }

    const [error] = await safe(database.transaction(queries));
    if (error?.nestedError?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') throw new MainError(MainError.NOT_FOUND, 'user or group not found');
    if (error) throw error;
}

async function remove(id) {
    assert.strictEqual(typeof id, 'string');

    const queries = [{
        query: 'DELETE FROM group_members WHERE group_id = ?',
        args: [ id ]
    }, {
        query: 'DELETE FROM groups WHERE id = ?',
        args: [ id ]
    }];

    await database.transaction(queries);
}

/**
 * Create or update a group synced from Cloudron SCIM.
 * @param {string} id
 * @param {string} name
 * @param {string[]} memberUserIds
 * @returns {Promise<{ created: boolean, updated: boolean }>}
 */
async function upsertFromScim(id, name, memberUserIds) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof name, 'string');
    assert(Array.isArray(memberUserIds));

    debugLog(`upsertFromScim: ${id} ${name} members:${memberUserIds.length}`);

    if (await get(id)) {
        await update(id, name);
        await setActive(id, true);
        await setMembers(id, memberUserIds);
        return { created: false, updated: true };
    }

    const [error] = await safe(add({ id, name }));
    if (error && error.reason !== MainError.ALREADY_EXISTS) throw error;
    if (error && error.reason === MainError.ALREADY_EXISTS) {
        await update(id, name);
        await setActive(id, true);
    }

    await setMembers(id, memberUserIds);

    return { created: true, updated: false };
}

export default {
    get,
    list,
    listWithMembers,
    getMembers,
    getMemberUserIds,
    getMembershipGroupIds,
    add,
    update,
    setActive,
    setMembers,
    remove,
    upsertFromScim
};
