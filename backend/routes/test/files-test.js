import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';

describe('files API', function () {
    const { setup, cleanup, serverUrl, admin, withToken, addUserFile } = common;

    before(setup);
    after(cleanup);

    it('requires authentication for home paths', async function () {
        const response = await superagent.get(`${serverUrl}/api/v1/files`)
            .query({ path: '/home/test.txt' })
            .ok(() => true);
        assert.equal(response.status, 401);
    });

    it('can upload and get a file', async function () {
        const response = await withToken(superagent.post(`${serverUrl}/api/v1/files`), admin.token)
            .query({ path: '/home/upload.txt', overwrite: true })
            .send(Buffer.from('uploaded content'));
        assert.equal(response.status, 200);

        const getResponse = await withToken(superagent.get(`${serverUrl}/api/v1/files`), admin.token)
            .query({ path: '/home/upload.txt' });
        assert.equal(getResponse.status, 200);
        assert.equal(getResponse.body.fileName, 'upload.txt');
    });

    it('can head a file', async function () {
        await addUserFile(admin.username, '/head.txt', 'head content');

        const response = await withToken(superagent.head(`${serverUrl}/api/v1/files`), admin.token)
            .query({ path: '/home/head.txt' })
            .ok(() => true);
        assert.equal(response.status, 200);
    });

    it('can delete a file', async function () {
        await addUserFile(admin.username, '/delete.txt', 'delete me');

        const response = await withToken(superagent.del(`${serverUrl}/api/v1/files`), admin.token)
            .query({ path: '/home/delete.txt' });
        assert.equal(response.status, 200);

        const missing = await withToken(superagent.get(`${serverUrl}/api/v1/files`), admin.token)
            .query({ path: '/home/delete.txt' })
            .ok(() => true);
        assert.equal(missing.status, 404);
    });
});
