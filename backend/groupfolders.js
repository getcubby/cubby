exports = module.exports = {
    add,
    get,
    list,
    remove,

    isPartOf
};

const assert = require('assert'),
    constants = require('./constants.js'),
    debug = require('debug')('cubby:groupfolders'),
    database = require('./database.js'),
    fs = require('fs-extra'),
    path = require('path'),
    MainError = require('./mainerror.js');

function postProcess(data) {
    data.groupFolderId = data.group_id;
    delete data.group_id;

    data.folderPath = data.folder_path;
    delete data.folder_path;

    return data;
}

// group ids are like slugs so they are unique and should be humanly readable
async function add(id, name, folderPath = '', users = []) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof folderPath, 'string');
    assert(Array.isArray(users));

    debug(`add: ${id} by name ${name} at ${folderPath} with users ${users}`);

    const queries = [{
        query: 'INSERT INTO groupfolders (id, name, folder_path) VALUES ($1, $2, $3)',
        args: [ id, name, folderPath ]
    }];

    for (const username of users) {
        queries.push({
            query: 'INSERT INTO groupfolders_members (groupfolder_id, username) VALUES ($1, $2)',
            args: [ id, username ]
        });
    }

    try {
        await database.transaction(queries);
    } catch (error) {
        if (error.nestedError && error.nestedError.constraint === 'groupfolders_members_username_fkey') throw new MainError(MainError.NOT_FOUND, 'user not found');
        if (error.nestedError && error.nestedError.constraint === 'groupfolders_pkey') throw new MainError(MainError.ALREADY_EXISTS, 'groupFolder already exists');
        throw error;
    }
}

async function get(id) {
    assert.strictEqual(typeof id, 'string');

    debug(`get: ${id}`);

    let result = await database.query('SELECT * FROM groupfolders WHERE id = $1', [ id ]);
    if (result.rows.length === 0) return null;

    const groupFolder = result.rows[0];

// maybe use 'SELECT ' + GROUPS_FIELDS + ',GROUP_CONCAT(groupMembers.userId) AS userIds ' +
    result = await database.query('SELECT * FROM groupfolders_members WHERE groupfolder_id = $1', [ id ]);
    groupFolder.members = result.rows.map((m) => m.username);

    return postProcess(groupFolder);
}

async function list(username = '') {
    assert.strictEqual(typeof username, 'string');

    let query = 'SELECT * FROM groupfolders';
    const args = [];

    if (username) {
        query = `${query} LEFT OUTER JOIN groupfolders_members ON groupfolders.id = groupfolders_members.groupfolder_id WHERE groupfolders_members.username = $1`;
        args.push(username);
    }

    const result = await database.query(query, args);

    result.rows.forEach(postProcess);

    return result.rows;
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
        query: 'DELETE FROM groupfolders_members WHERE groupfolder_id = $1',
        args: [ id ]
    }, {
        query: 'DELETE FROM groupfolders WHERE id = $1',
        args: [ id ]
    }];

    await database.transaction(queries);
}

function isPartOf(groupFolder, username) {
    assert.strictEqual(typeof groupFolder, 'object');
    assert.strictEqual(typeof username, 'string');

    return !!groupFolder.members.find((u) => u === username);
}
