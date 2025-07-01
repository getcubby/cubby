exports = module.exports = {
    webdavLogin,
    add,
    exists,
    get,
    getByAccessToken,
    list,
    setWebdavPassword,
    update,
    setAdmin,
    remove
};

const assert = require('assert'),
    constants = require('./constants.js'),
    crypto = require('crypto'),
    { cp } = require('node:fs/promises'),
    debug = require('debug')('cubby:users'),
    database = require('./database.js'),
    path = require('path'),
    tokens = require('./tokens.js'),
    MainError = require('./mainerror.js');

const CRYPTO_SALT_SIZE = 64; // 512-bit salt
const CRYPTO_ITERATIONS = 10000; // iterations
const CRYPTO_KEY_LENGTH = 512; // bits
const CRYPTO_DIGEST = 'sha1'; // used to be the default in node 4.1.1 cannot change since it will affect existing db records

function postProcess(data) {
    data.displayName = data.display_name;
    delete data.display_name;

    return data;
}

async function webdavLogin(username, password) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');

    if (username === '' || password === '') return null;

    debug('webdavLogin: ', username);

    const user = await get(username);
    if (!user) return null;

    const saltBinary = Buffer.from(user.salt, 'hex');
    const derivedKey = crypto.pbkdf2Sync(password, saltBinary, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, CRYPTO_DIGEST);
    const derivedKeyHex = Buffer.from(derivedKey, 'binary').toString('hex');

    if (derivedKeyHex !== user.password) return null;

    return user;
}

async function add(user) {
    assert.strictEqual(typeof user, 'object');

    const username = user.username;
    const email = user.email;
    const displayName = user.displayName;
    const password = '';
    const salt = '';
    const admin = false;

    try {
        const result = await database.query('INSERT INTO users (username, email, display_name, password, salt, admin) VALUES ($1, $2, $3, $4, $5, $6)', [ username, email, displayName, password, salt, admin ]);
        if (result.rowCount !== 1) throw new MainError(MainError.DATABASE_ERROR, 'failed to insert');
    } catch (error) {
        if (error.nestedError && error.nestedError.detail && error.nestedError.detail.indexOf('already exists') !== -1 && error.nestedError.detail.indexOf('username') !== -1) throw new MainError(MainError.ALREADY_EXISTS, 'username already exists');

        throw error;
    }

    // copy skeleton folder
    debug(`add: copy skeleton folder...`);
    await cp(constants.SKELETON_FOLDER, path.join(constants.USER_DATA_ROOT, username), { recursive: true });
}

async function exists(username) {
    assert.strictEqual(typeof username, 'string');

    let res = false;
    try {
        await get(username);
        res = true;
    } catch (error) {
        if (error.reason !== MainError.NOT_FOUND) console.error(`exists ${username} error:`, error);
    }

    return res;
}

async function get(username) {
    assert.strictEqual(typeof username, 'string');

    const result = await database.query('SELECT * FROM users WHERE username = $1', [ username ]);
    if (result.rows.length === 0) throw new MainError(MainError.NOT_FOUND, 'user not found');

    return postProcess(result.rows[0]);
}

async function getByAccessToken(accessToken) {
    assert.strictEqual(typeof accessToken, 'string');

    const token = await tokens.get(accessToken);
    if (!token) return null;

    return await get(token.username);
}

async function list() {
    const users = await database.query('SELECT * FROM users ORDER BY username');

    users.rows.forEach(postProcess);

    return users.rows;
}

async function update(username, user) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof user, 'object');

    await database.query('UPDATE users SET email = $1, display_name = $2 WHERE username = $3', [ user.email, user.displayName, username ]);
}

async function setAdmin(username, admin) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof admin, 'boolean');

    await database.query('UPDATE users SET admin = $1 WHERE username = $2', [ admin, username ]);
}

async function setWebdavPassword(username, password) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');

    try {
        const rawSalt = crypto.randomBytes(CRYPTO_SALT_SIZE);
        const derivedKey = crypto.pbkdf2Sync(password, rawSalt, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, CRYPTO_DIGEST);

        const salt = rawSalt.toString('hex');
        const saltedPassword = Buffer.from(derivedKey, 'binary').toString('hex');

        await database.query('UPDATE users SET password = $1, salt = $2 WHERE username = $3', [ saltedPassword, salt, username ]);
    } catch (error) {
        throw new MainError(MainError.CRYPTO_ERROR, error);
    }
}

async function remove(username) {
    assert.strictEqual(typeof username, 'string');

    await database.query('DELETE FROM users WHERE username = $1', [ username ]);
}
