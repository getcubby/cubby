import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';

describe('misc API', function () {
    const { setup, cleanup, serverUrl, alice, withToken } = common;

    before(setup);
    after(cleanup);

    it('can healthcheck', async function () {
        const response = await superagent.get(`${serverUrl}/api/healthcheck`);
        assert.equal(response.status, 200);
    });

    it('can get public config', async function () {
        const response = await superagent.get(`${serverUrl}/api/v1/config`);
        assert.equal(response.status, 200);
        assert.ok(response.body.viewers);
        assert.equal(typeof response.body.appPasswordsUrl, 'string');
    });

    it('requires entries to download', async function () {
        const response = await withToken(superagent.get(`${serverUrl}/api/v1/download`), alice.token)
            .ok(() => true);
        assert.equal(response.status, 400);
    });
});
