import assert from 'assert';
import crypto from 'crypto';
import database from './database.js';

async function add(userId) {
    assert.strictEqual(typeof userId, 'string');

    const token = crypto.randomBytes(32).toString('hex');

    await database.query('INSERT INTO tokens (id, user_id) VALUES (?, ?)', [ token, userId ]);

    return token;
}

async function get(token) {
    assert.strictEqual(typeof token, 'string');

    const result = await database.query('SELECT * FROM tokens WHERE id = ?', [ token ]);
    if (result.rows.length === 0) return null;

    return result.rows[0];
}

async function remove(token) {
    assert.strictEqual(typeof token, 'string');

    await database.query('DELETE FROM tokens WHERE id = ?', [ token ]);
}

async function cleanup(maxAgeMs) {
    assert.strictEqual(typeof maxAgeMs, 'number');

    const cutoff = new Date(Date.now() - maxAgeMs);
    await database.query('DELETE FROM tokens WHERE created_at < ?', [ cutoff ]);
}

export default {
    add,
    get,
    remove,
    cleanup
};
