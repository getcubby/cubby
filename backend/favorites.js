import assert from 'assert';
import debug from 'debug';
import files from './files.js';
import database from './database.js';
import crypto from 'crypto';
import MainError from './mainerror.js';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:favorites');

function postProcess(data) {
    data.filePath = data.file_path;
    delete data.file_path;

    data.createdAt = data.created_at;
    delete data.created_at;

    return data;
}

async function listByOwnerAndFilePath(owner, filePath) {
    assert(typeof owner === 'string');
    assert(typeof filePath === 'string');

    debugLog(`listByOwnerAndFilePath: ${owner} ${filePath}`);

    const result = await database.query('SELECT * FROM favorites WHERE owner = $1 AND file_path = $2', [ owner, filePath ]);

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

// owner could be username or groupfolder-groupname
async function create(username, owner, filePath) {
    assert(typeof username === 'string');
    assert(typeof owner === 'string');
    assert(filePath && typeof filePath === 'string');

    debugLog(`create: ${username} ${filePath}`);

    const fullFilePath = files.getAbsolutePath(owner, filePath);
    if (!fullFilePath) throw new MainError(MainError.INVALID_PATH);

    const id = 'fid-' + crypto.createHash('md5').update(`${username}${filePath}`, 'utf8').digest('hex');

    const [error] = await safe(database.query('INSERT INTO favorites (id, username, owner, file_path) VALUES ($1, $2, $3, $4) ON CONFLICT ON CONSTRAINT favorites_pkey DO NOTHING', [ id, username, owner, filePath ]));
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

export default {
    listByOwnerAndFilePath,
    list,
    get,
    create,
    remove
};
