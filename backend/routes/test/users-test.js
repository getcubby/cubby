import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';

describe('users API', function () {
    const { setup, cleanup, serverUrl, user, withToken } = common;

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
});
