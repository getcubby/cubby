import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import activity from '../../activity.js';
import common from './common.js';
import superagent from '@cloudron/superagent';

describe('activity API', function () {
    const { setup, cleanup, serverUrl, admin, withToken, addUserFile } = common;

    before(setup);
    after(cleanup);

    it('can list activity for a file path', async function () {
        await addUserFile(admin.username, '/activity-api.txt', 'activity me');

        await activity.log({
            actor: admin.username,
            owner: admin.username,
            filePath: '/activity-api.txt',
            action: 'created'
        });

        const response = await withToken(superagent.get(`${serverUrl}/api/v1/activity`), admin.token)
            .query({ path: '/home/activity-api.txt' });
        assert.equal(response.status, 200);
        assert.equal(response.body.activity.length, 1);
        assert.equal(response.body.activity[0].action, 'created');
        assert.equal(response.body.activity[0].filePath, '/activity-api.txt');
    });

    it('lists activity logged on file upload', async function () {
        await withToken(superagent.post(`${serverUrl}/api/v1/files`), admin.token)
            .query({ path: '/home/upload-activity.txt', overwrite: true })
            .set('Content-Type', 'application/octet-stream')
            .send(Buffer.from('uploaded'));

        const response = await withToken(superagent.get(`${serverUrl}/api/v1/activity`), admin.token)
            .query({ path: '/home/upload-activity.txt' });
        assert.equal(response.status, 200);
        assert.equal(response.body.activity.length, 1);
        assert.equal(response.body.activity[0].action, 'created');
        assert.equal(response.body.activity[0].actor, admin.username);
    });

    it('returns empty activity for paths with no rows', async function () {
        await addUserFile(admin.username, '/activity-empty.txt', 'empty');

        const response = await withToken(superagent.get(`${serverUrl}/api/v1/activity`), admin.token)
            .query({ path: '/home/activity-empty.txt' });
        assert.equal(response.status, 200);
        assert.equal(response.body.activity.length, 0);
    });
});
