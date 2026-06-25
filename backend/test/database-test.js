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
        await database.query('INSERT INTO users (username, email, display_name, admin) VALUES ($1, $2, $3, $4)', [ 'txuser', 'tx@test.local', 'Tx User', false ]);

        const [error] = await safe(database.transaction([
            { query: 'UPDATE users SET email = $1 WHERE username = $2', args: [ 'changed@test.local', 'txuser' ] },
            { query: 'INSERT INTO users (username, email, display_name, admin) VALUES ($1, $2, $3, $4)', args: [ 'txuser', 'dup@test.local', 'Dup User', false ] }
        ]));
        assert.ok(error);
        assert.equal(error.reason, MainError.DATABASE_ERROR);

        const result = await database.query('SELECT email FROM users WHERE username = $1', [ 'txuser' ]);
        assert.equal(result.rows[0].email, 'tx@test.local');
    });
});
