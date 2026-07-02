import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';

describe('shares API', function () {
    const { setup, cleanup, serverUrl, admin, user, withToken, addUserFile } = common;

    before(setup);
    after(cleanup);

    it('can create and list shares', async function () {
        await addUserFile(admin.username, '/shared-api.txt', 'shared via api');

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), admin.token)
            .send({
                ownerUsername: admin.username,
                path: '/shared-api.txt',
                receiverUsername: user.username
            });
        assert.equal(createResponse.status, 200);
        assert.ok(createResponse.body.shareId);

        const listResponse = await withToken(superagent.get(`${serverUrl}/api/v1/shares`), admin.token);
        assert.equal(listResponse.body.shares.length, 1);
        assert.equal(listResponse.body.shares[0].id, createResponse.body.shareId);
    });

    it('can access a public share link', async function () {
        await addUserFile(admin.username, '/public.txt', 'public share');

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), admin.token)
            .send({
                ownerUsername: admin.username,
                path: '/public.txt',
                readonly: true
            });
        const shareId = createResponse.body.shareId;

        const shareResponse = await superagent.get(`${serverUrl}/api/v1/shares/${shareId}`)
            .query({ path: '' });
        assert.equal(shareResponse.status, 200);
        assert.equal(shareResponse.body.fileName, 'public.txt');
    });

    it('can remove a share', async function () {
        await addUserFile(admin.username, '/remove-share.txt', 'remove share');

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), admin.token)
            .send({
                ownerUsername: admin.username,
                path: '/remove-share.txt',
                receiverEmail: 'guest@test.local'
            });

        const removeResponse = await withToken(superagent.del(`${serverUrl}/api/v1/shares`), admin.token)
            .query({ shareId: createResponse.body.shareId });
        assert.equal(removeResponse.status, 200);

        const listResponse = await withToken(superagent.get(`${serverUrl}/api/v1/shares`), admin.token);
        assert.equal(listResponse.body.shares.some((share) => share.id === createResponse.body.shareId), false);
    });

    it('logs unshared when a share is removed', async function () {
        await addUserFile(admin.username, '/unshare-activity.txt', 'unshare activity');

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), admin.token)
            .send({
                ownerUsername: admin.username,
                path: '/unshare-activity.txt',
                receiverUsername: user.username
            });

        await withToken(superagent.del(`${serverUrl}/api/v1/shares`), admin.token)
            .query({ shareId: createResponse.body.shareId });

        const activityResponse = await withToken(superagent.get(`${serverUrl}/api/v1/activity`), admin.token)
            .query({ path: '/home/unshare-activity.txt' });
        assert.equal(activityResponse.status, 200);
        assert.equal(activityResponse.body.activity[0].action, 'unshared');
        assert.equal(activityResponse.body.activity[0].details.shareId, createResponse.body.shareId);
    });
});
