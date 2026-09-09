import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import database from '../database.js';
import MainError from '../mainerror.js';
import safe from '@cloudron/safetydance';

describe('database', function () {
    const { databaseSetup, cleanup } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    it('can query an empty users table', async function () {
        const result = await database.query('SELECT COUNT(*) AS count FROM users');
        assert.equal(Number(result.rows[0].count), 0);
    });

    it('rolls back failed transactions', async function () {
        await database.query('INSERT INTO users (username, email, display_name) VALUES (?, ?, ?)', [ 'txuser', 'tx@test.local', 'Tx User' ]);

        const [error] = await safe(database.transaction([
            { query: 'UPDATE users SET email = ? WHERE username = ?', args: [ 'changed@test.local', 'txuser' ] },
            { query: 'INSERT INTO users (username, email, display_name) VALUES (?, ?, ?)', args: [ 'txuser', 'dup@test.local', 'Dup User' ] }
        ]));
        assert.ok(error);
        assert.equal(error.reason, MainError.DATABASE_ERROR);

        const result = await database.query('SELECT email FROM users WHERE username = ?', [ 'txuser' ]);
        assert.equal(result.rows[0].email, 'tx@test.local');
    });
});
