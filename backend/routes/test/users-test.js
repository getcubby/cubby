import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';

describe('users API', function () {
    const { setup, cleanup, serverUrl, admin, user, withToken } = common;

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

    it('cannot set admin status without admin', async function () {
        const response = await withToken(superagent.put(`${serverUrl}/api/v1/users/${user.username}/admin`), user.token)
            .send({ admin: true })
            .ok(() => true);
        assert.equal(response.status, 403);
    });

    it('can set admin status', async function () {
        const response = await withToken(superagent.put(`${serverUrl}/api/v1/users/${user.username}/admin`), admin.token)
            .send({ admin: true });
        assert.equal(response.status, 200);

        const profile = await withToken(superagent.get(`${serverUrl}/api/v1/profile`), user.token);
        assert.equal(profile.body.admin, true);
    });

    it('cannot set admin status on self', async function () {
        const response = await withToken(superagent.put(`${serverUrl}/api/v1/users/${admin.username}/admin`), admin.token)
            .send({ admin: false })
            .ok(() => true);
        assert.equal(response.status, 403);
    });
});
