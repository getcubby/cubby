import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import MainError from '../mainerror.js';
import safe from '@cloudron/safetydance';
import tokens from '../tokens.js';
import users from '../users.js';

describe('users', function () {
    const { databaseSetup, cleanup, alice, user } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    it('can add and get a user', async function () {
        await users.add(alice);

        const result = await users.get(alice.username);
        assert.equal(result.username, alice.username);
        assert.equal(result.email, alice.email);
        assert.equal(result.displayName, alice.displayName);
    });

    it('rejects duplicate usernames', async function () {
        await users.add(user);

        const [error] = await safe(users.add(user));
        assert.ok(error);
        assert.equal(error.reason, MainError.ALREADY_EXISTS);
    });

    it('can list users', async function () {
        await users.add(alice);
        await users.add(user);

        const result = await users.list();
        assert.equal(result.length, 2);
        assert.deepEqual(result.map((u) => u.username).sort(), [ alice.username, user.username ].sort());
    });

    it('resolves users by access token', async function () {
        await users.add(user);
        const accessToken = await tokens.add(user.username);

        const result = await users.getByAccessToken(accessToken);
        assert.equal(result.username, user.username);
    });

    it('can update a user', async function () {
        await users.add(user);

        await users.update(user.username, { email: 'updated@test.local', displayName: 'Updated User' });

        const result = await users.get(user.username);
        assert.equal(result.email, 'updated@test.local');
        assert.equal(result.displayName, 'Updated User');
        assert.equal(await users.exists(user.username), true);
    });

    it('can upsert users from scim', async function () {
        const created = await users.upsertFromScim('scimuser', { email: 'scim@test.local', displayName: 'Scim User' });
        assert.equal(created.created, true);
        assert.equal(created.updated, false);

        const updated = await users.upsertFromScim('scimuser', { email: 'scim-new@test.local', displayName: 'Scim Updated' });
        assert.equal(updated.created, false);
        assert.equal(updated.updated, true);

        const result = await users.get('scimuser');
        assert.equal(result.email, 'scim-new@test.local');
        assert.equal(result.displayName, 'Scim Updated');
    });
});
