import assert from 'assert';
import database from './database.js';
import safe from '@cloudron/safetydance';

export const COLLABORA_KEY = 'collabora';

async function get(key) {
    assert.strictEqual(typeof key, 'string');

    const result = await database.query('SELECT name, value FROM settings WHERE name = $1', [ key ]);
    if (result.rows.length === 0) return null;

    return result.rows[0].value;
}

async function set(key, value) {
    assert.strictEqual(typeof key, 'string');
    assert(value === null || typeof value === 'string');

    await database.query(
        'INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value',
        [ key, value ]
    );
}

async function getJson(key) {
    assert.strictEqual(typeof key, 'string');

    return safe.JSON.parse(await get(key));
}

async function setJson(key, value) {
    assert.strictEqual(typeof key, 'string');
    assert(value === null || typeof value === 'object');

    await set(key, value ? JSON.stringify(value) : null);
}

export default {
    get,
    set,
    getJson,
    setJson,
    COLLABORA_KEY
};
