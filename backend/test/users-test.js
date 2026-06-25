import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import MainError from '../mainerror.js';
import safe from '@cloudron/safetydance';
import tokens from '../tokens.js';
import users from '../users.js';

describe('users', function () {
    const { databaseSetup, cleanup, admin, user } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    it('can add and get a user', async function () {
        await users.add(admin);

        const result = await users.get(admin.username);
        assert.equal(result.username, admin.username);
        assert.equal(result.email, admin.email);
        assert.equal(result.displayName, admin.displayName);
        assert.equal(result.admin, false);
    });

    it('rejects duplicate usernames', async function () {
        await users.add(user);

        const [error] = await safe(users.add(user));
        assert.ok(error);
        assert.equal(error.reason, MainError.ALREADY_EXISTS);
    });

    it('can list users', async function () {
        await users.add(admin);
        await users.add(user);

        const result = await users.list();
        assert.equal(result.length, 2);
        assert.deepEqual(result.map((u) => u.username).sort(), [ admin.username, user.username ].sort());
    });

    it('promotes the first ensureUser login to admin', async function () {
        const ensured = await users.ensureUser({
            username: 'firstlogin',
            email: 'first@test.local',
            displayName: 'First Login'
        });

        assert.equal(ensured.admin, true);
    });

    it('resolves users by access token', async function () {
        await users.add(user);
        const accessToken = await tokens.add(user.username);

        const result = await users.getByAccessToken(accessToken);
        assert.equal(result.username, user.username);
    });
});
