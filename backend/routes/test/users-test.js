import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import groups from '../../groups.js';
import superagent from '@cloudron/superagent';
import users from '../../users.js';

describe('users API', function () {
    const { setup, cleanup, serverUrl, alice, user, withToken } = common;

    before(setup);
    after(cleanup);

    it('requires authentication for profile', async function () {
        const response = await superagent.get(`${serverUrl}/api/v1/profile`).ok(() => true);
        assert.equal(response.status, 401);
    });

    it('can get profile with token', async function () {
        const response = await withToken(superagent.get(`${serverUrl}/api/v1/profile`), user.token);
        assert.equal(response.status, 200);
        assert.equal(response.body.username, user.username);
    });

    it('can list users when authenticated', async function () {
        const response = await withToken(superagent.get(`${serverUrl}/api/v1/users`), user.token);
        assert.equal(response.status, 200);
        assert.ok(response.body.users.length >= 2);
    });

    it('omits inactive users and groups from the assign lists', async function () {
        await users.setActive(user.username, false);
        await groups.upsertFromScim('gid-hidden', 'Hidden', [ user.username ]);
        await groups.setActive('gid-hidden', false);
        await groups.upsertFromScim('gid-visible', 'Visible', []);

        const userList = await withToken(superagent.get(`${serverUrl}/api/v1/users`), alice.token);
        assert.equal(userList.status, 200);
        assert.equal(userList.body.users.find((u) => u.username === user.username), undefined);
        assert.ok(userList.body.users.find((u) => u.username === alice.username));

        const groupList = await withToken(superagent.get(`${serverUrl}/api/v1/groups`), alice.token);
        assert.equal(groupList.status, 200);
        assert.equal(groupList.body.groups.find((g) => g.id === 'gid-hidden'), undefined);
        assert.ok(groupList.body.groups.find((g) => g.id === 'gid-visible'));
    });
});
