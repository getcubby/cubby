exports = module.exports = {
    add,
    get,
    list,
    update,
    remove,

    isPartOf
};

const assert = require('assert'),
    constants = require('./constants.js'),
    crypto = require('crypto'),
    debug = require('debug')('cubby:groupfolders'),
    database = require('./database.js'),
    fs = require('fs-extra'),
    path = require('path'),
    MainError = require('./mainerror.js'),
    recoll = require('./recoll.js');

function postProcess(data) {
    data.folderPath = data.folder_path;
    delete data.folder_path;

    if (!data.folderPath) data.folderPath = path.join(constants.GROUPS_DATA_ROOT, data.id);

    return data;
}

// group ids are like slugs so they are unique and should be humanly readable
async function add(idOrSlug, name, folderPath = '', members = []) {
    assert.strictEqual(typeof idOrSlug, 'string');
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof folderPath, 'string');
    assert(Array.isArray(members));

    // if no id slug is provided generate one
    if (!idOrSlug) idOrSlug = crypto.randomBytes(6).toString('hex');

    debug(`add: ${idOrSlug} by name ${name} at ${folderPath} with members ${members}`);

    const queries = [{
        query: 'INSERT INTO groupfolders (id, name, folder_path) VALUES ($1, $2, $3)',
        args: [ idOrSlug, name, folderPath ]
    }];

    for (const username of members) {
        queries.push({
            query: 'INSERT INTO groupfolders_members (groupfolder_id, username) VALUES ($1, $2)',
            args: [ idOrSlug, username ]
        });
    }

    try {
        await database.transaction(queries);
    } catch (error) {
        if (error.nestedError && error.nestedError.constraint === 'groupfolders_members_username_fkey') throw new MainError(MainError.NOT_FOUND, 'user not found');
        if (error.nestedError && error.nestedError.constraint === 'groupfolders_pkey') throw new MainError(MainError.ALREADY_EXISTS, 'groupFolder already exists');
        throw error;
    }

    // ensure folder
    if (!folderPath) folderPath = path.join(constants.GROUPS_DATA_ROOT, idOrSlug);
    fs.mkdirSync(folderPath, { recursive: true });

    // kick off indexer in background
    for (const username of members) {
        recoll.indexByUsername(username);
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
    const folders = result.rows;

    folders.forEach(postProcess);

    for (const folder of folders) {
        const result = await database.query('SELECT * FROM groupfolders_members WHERE groupfolder_id = $1', [ folder.id ]);
        folder.members = result.rows.map((m) => m.username);
    }

    return folders;
}

async function update(id, name, members) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof name, 'string');
    assert(Array.isArray(members));

    debug(`update: ${id} by name ${name} with members ${members}`);

    const queries = [{
        query: 'UPDATE groupfolders set name=$1 WHERE id=$2',
        args: [ name, id ]
    }];

    queries.push({
        query: 'DELETE FROM groupfolders_members WHERE groupfolder_id=$1',
        args: [ id ]
    });

    for (const username of members) {
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

    // FIXME reindex for all for the moment until we know who got removed!
    recoll.index();
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

    // FIXME reindex for all for the moment until we know who got removed!
    recoll.index();
}

function isPartOf(groupFolder, username) {
    assert.strictEqual(typeof groupFolder, 'object');
    assert.strictEqual(typeof username, 'string');

    return !!groupFolder.members.find((u) => u === username);
}
