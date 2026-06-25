import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import tokens from '../tokens.js';
import users from '../users.js';

describe('tokens', function () {
    const { databaseSetup, cleanup, user } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    it('can add, get, and remove a token', async function () {
        await users.add(user);

        const token = await tokens.add(user.username);
        assert.strictEqual(typeof token, 'string');
        assert.ok(token.length > 0);

        const result = await tokens.get(token);
        assert.equal(result.username, user.username);

        await tokens.remove(token);
        assert.equal(await tokens.get(token), null);
    });

    it('returns null for unknown tokens', async function () {
        assert.equal(await tokens.get('unknown-token'), null);
    });
});
