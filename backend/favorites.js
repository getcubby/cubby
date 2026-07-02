import assert from 'assert';
import debug from 'debug';
import files from './files.js';
import database from './database.js';
import crypto from 'crypto';
import MainError from './mainerror.js';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:favorites');

function makeId(username, filePath) {
    return 'fid-' + crypto.createHash('md5').update(`${username}${filePath}`, 'utf8').digest('hex');
}

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

    data.createdAt = data.created_at;
    delete data.created_at;

    if (data.owner_groupfolder) data.owner = `groupfolder-${data.owner_groupfolder}`;
    else data.owner = data.owner_username;
    delete data.owner_username;
    delete data.owner_groupfolder;

    return data;
}

async function listByOwnerAndFilePath(owner, filePath) {
    assert(typeof owner === 'string');
    assert(typeof filePath === 'string');

    const { ownerUsername, ownerGroupfolder } = ownerToDbColumns(owner);

    debugLog(`listByOwnerAndFilePath: ${owner} ${filePath}`);

    const result = await database.query('SELECT * FROM favorites WHERE (owner_username = $1 OR owner_groupfolder = $2) AND file_path = $3', [ ownerUsername, ownerGroupfolder, filePath ]);

    result.rows.forEach(postProcess);

    return result.rows;
}

async function list(username) {
    assert.strictEqual(typeof username, 'string');

    debugLog(`list: ${username}`);

    const result = await database.query('SELECT * FROM favorites WHERE username = $1', [ username ]);

    result.rows.forEach(postProcess);

    return result.rows;
}

async function create(username, owner, filePath) {
    assert(typeof username === 'string');
    assert(typeof owner === 'string');
    assert(filePath && typeof filePath === 'string');

    const { ownerUsername, ownerGroupfolder } = ownerToDbColumns(owner);

    debugLog(`create: ${username} ${filePath}`);

    const fullFilePath = files.getAbsolutePath(owner, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    const id = makeId(username, filePath);

    const [error] = await safe(database.query('INSERT INTO favorites (id, username, owner_username, owner_groupfolder, file_path) VALUES ($1, $2, $3, $4, $5) ON CONFLICT ON CONSTRAINT favorites_pkey DO NOTHING', [ id, username, ownerUsername, ownerGroupfolder, filePath ]));
    if (error) throw new MainError(MainError.BAD_STATE, error);

    return id;
}

async function get(id) {
    assert.strictEqual(typeof id, 'string');

    debugLog(`get: ${id}`);

    const result = await database.query('SELECT * FROM favorites WHERE id = $1', [ id ]);

    if (result.rows.length === 0) return null;

    return postProcess(result.rows[0]);
}

async function remove(id) {
    assert.strictEqual(typeof id, 'string');

    debugLog(`remove: ${id}`);

    await database.query('DELETE FROM favorites WHERE id = $1', [ id ]);
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
    const result = await database.query(`SELECT * FROM favorites WHERE (owner_username = $1 OR owner_groupfolder = $2) AND ${pathCondition}`, [ from.ownerUsername, from.ownerGroupfolder, fromPath ]);

    if (result.rows.length === 0) return;

    const queries = [];

    for (const row of result.rows) {
        const newFilePath = toPath + row.file_path.slice(fromPath.length);
        const newId = makeId(row.username, newFilePath);

        queries.push({ query: 'DELETE FROM favorites WHERE id = $1', args: [ row.id ] });
        queries.push({
            query: 'INSERT INTO favorites (id, username, owner_username, owner_groupfolder, file_path, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT ON CONSTRAINT favorites_pkey DO NOTHING',
            args: [ newId, row.username, to.ownerUsername, to.ownerGroupfolder, newFilePath, row.created_at ]
        });
    }

    await database.transaction(queries);
}

export default {
    listByOwnerAndFilePath,
    list,
    get,
    create,
    remove,
    relocatePaths
};
