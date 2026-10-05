import assert from 'assert';
import crypto from 'crypto';
import database from './database.js';

async function add({ username, accessToken, refreshToken, expiresIn }) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof accessToken, 'string');

    const id = crypto.randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + (expiresIn || 3600);

    await database.query('INSERT INTO mobile_tokens (id, username, access_token, refresh_token, access_token_expires_at) VALUES (?, ?, ?, ?, ?)', [ id, username, accessToken, refreshToken || null, expiresAt ]);

    return id;
}

async function get(id) {
    assert.strictEqual(typeof id, 'string');

    const result = await database.query('SELECT * FROM mobile_tokens WHERE id = ?', [ id ]);
    if (result.rows.length === 0) return null;

    return result.rows[0];
}

async function updateTokens(id, { accessToken, refreshToken, expiresIn }) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof accessToken, 'string');

    const expiresAt = Math.floor(Date.now() / 1000) + (expiresIn || 3600);

    await database.query('UPDATE mobile_tokens SET access_token = ?, refresh_token = COALESCE(?, refresh_token), access_token_expires_at = ? WHERE id = ?', [ accessToken, refreshToken || null, expiresAt, id ]);
}

async function remove(id) {
    assert.strictEqual(typeof id, 'string');

    await database.query('DELETE FROM mobile_tokens WHERE id = ?', [ id ]);
}

export default {
    add,
    get,
    updateTokens,
    remove
};
