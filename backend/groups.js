exports = module.exports = {
    add,
    get,
    list,
    remove,

    isPartOf
};

const assert = require('assert'),
    constants = require('./constants.js'),
    debug = require('debug')('cubby:groups'),
    database = require('./database.js'),
    fs = require('fs-extra'),
    path = require('path'),
    MainError = require('./mainerror.js');

function postProcess(data) {
    data.groupId = data.group_id;
    delete data.group_id;

    return data;
}

// group ids are like slugs so they are unique and should be humanly readable
async function add(id, name, users = []) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof name, 'string');
    assert(Array.isArray(users));

    debug(`add: ${id} by name ${name} with users ${users}`);

    const queries = [{
        query: 'INSERT INTO groups (id, name) VALUES ($1, $2)',
        args: [ id, name ]
    }];

    for (const username of users) {
        queries.push({
            query: 'INSERT INTO group_members (group_id, username) VALUES ($1, $2)',
            args: [ id, username ]
        });
    }

    try {
        await database.transaction(queries);
    } catch (error) {
        if (error.nestedError && error.nestedError.constraint === 'group_members_username_fkey') throw new MainError(MainError.NOT_FOUND, 'user not found');
        if (error.nestedError && error.nestedError.constraint === 'groups_pkey') throw new MainError(MainError.ALREADY_EXISTS, 'group already exists');
        throw error;
    }
}

async function get(id) {
    assert.strictEqual(typeof id, 'string');

    debug(`get: group ${id}`);

    let result = await database.query('SELECT * FROM groups WHERE id = $1', [ id ]);
    if (result.rows.length === 0) return null;

    const group = result.rows[0];

// maybe use 'SELECT ' + GROUPS_FIELDS + ',GROUP_CONCAT(groupMembers.userId) AS userIds ' +
    result = await database.query('SELECT * FROM group_members WHERE group_id = $1', [ id ]);
    group.members = result.rows.map((m) => m.username);

    return group;
}

async function list(username = '') {
    assert.strictEqual(typeof username, 'string');

    let query = 'SELECT * FROM groups';
    const args = [];

    if (username) {
        query = `${query} LEFT OUTER JOIN group_members ON groups.id = group_members.group_id WHERE group_members.username = $1`;
        args.push(username);
    }

// maybe use 'SELECT ' + GROUPS_FIELDS + ',GROUP_CONCAT(groupMembers.userId) AS userIds ' +
    const groups = await database.query(query, args);

    return groups.rows;
}

async function remove(id) {
    assert.strictEqual(typeof id, 'string');

    const groupFolderPath = path.join(constants.GROUPS_DATA_ROOT, id);

    debug(`remove: ${id} and folder at ${groupFolderPath}`);

    try {
        await fs.remove(groupFolderPath);
    } catch (error) {
        throw new MainError(MainError.FS_ERROR, error);
    }

    const queries = [{
        query: 'DELETE FROM group_members WHERE group_id = $1',
        args: [ id ]
    }, {
        query: 'DELETE FROM groups WHERE id = $1',
        args: [ id ]
    }];

    await database.transaction(queries);
}

function isPartOf(group, username) {
    assert.strictEqual(typeof group, 'object');
    assert.strictEqual(typeof username, 'string');

    return !!group.members.find((u) => u === username);
}
