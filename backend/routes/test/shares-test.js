import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';

describe('shares API', function () {
    const { setup, cleanup, serverUrl, alice, user, withToken, addUserFile } = common;

    before(setup);
    after(cleanup);

    it('can create and list shares', async function () {
        await addUserFile(alice.username, '/shared-api.txt', 'shared via api');

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({
                ownerUsername: alice.username,
                path: '/shared-api.txt',
                receiverUsername: user.username
            });
        assert.equal(createResponse.status, 200);
        assert.ok(createResponse.body.shareId);

        const listResponse = await withToken(superagent.get(`${serverUrl}/api/v1/shares`), alice.token);
        assert.equal(listResponse.body.shares.length, 1);
        assert.equal(listResponse.body.shares[0].id, createResponse.body.shareId);
    });

    it('can access a public share link', async function () {
        await addUserFile(alice.username, '/public.txt', 'public share');

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({
                ownerUsername: alice.username,
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
        await addUserFile(alice.username, '/remove-share.txt', 'remove share');

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({
                ownerUsername: alice.username,
                path: '/remove-share.txt',
                receiverEmail: 'guest@test.local'
            });

        const removeResponse = await withToken(superagent.del(`${serverUrl}/api/v1/shares`), alice.token)
            .query({ shareId: createResponse.body.shareId });
        assert.equal(removeResponse.status, 200);

        const listResponse = await withToken(superagent.get(`${serverUrl}/api/v1/shares`), alice.token);
        assert.equal(listResponse.body.shares.some((share) => share.id === createResponse.body.shareId), false);
    });

    it('logs unshared when a share is removed', async function () {
        await addUserFile(alice.username, '/unshare-activity.txt', 'unshare activity');

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({
                ownerUsername: alice.username,
                path: '/unshare-activity.txt',
                receiverUsername: user.username
            });

        await withToken(superagent.del(`${serverUrl}/api/v1/shares`), alice.token)
            .query({ shareId: createResponse.body.shareId });

        const activityResponse = await withToken(superagent.get(`${serverUrl}/api/v1/activity`), alice.token)
            .query({ path: '/home/unshare-activity.txt' });
        assert.equal(activityResponse.status, 200);
        assert.equal(activityResponse.body.activity[0].action, 'unshared');
        assert.equal(activityResponse.body.activity[0].details.shareId, createResponse.body.shareId);
    });

    it('protects a public link share with a password', async function () {
        await addUserFile(alice.username, '/secret.txt', 'password protected');

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({
                ownerUsername: alice.username,
                path: '/secret.txt',
                readonly: true,
                password: 'hunter2'
            });
        assert.equal(createResponse.status, 200);
        const shareId = createResponse.body.shareId;

        // locked without a session unlock
        const lockedResponse = await superagent.get(`${serverUrl}/api/v1/shares/${shareId}`)
            .query({ path: '' })
            .ok(() => true);
        assert.equal(lockedResponse.status, 423);

        // wrong password is rejected
        const wrongResponse = await superagent.post(`${serverUrl}/api/v1/shares/${shareId}/unlock`)
            .send({ password: 'wrong' })
            .ok(() => true);
        assert.equal(wrongResponse.status, 401);

        // correct password unlocks and sets a session cookie
        const unlockResponse = await superagent.post(`${serverUrl}/api/v1/shares/${shareId}/unlock`)
            .send({ password: 'hunter2' });
        assert.equal(unlockResponse.status, 200);
        const cookie = (unlockResponse.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
        assert.ok(cookie);

        // now the share can be accessed with the session cookie
        const unlockedResponse = await superagent.get(`${serverUrl}/api/v1/shares/${shareId}`)
            .query({ path: '' })
            .set('cookie', cookie);
        assert.equal(unlockedResponse.status, 200);
        assert.equal(unlockedResponse.body.fileName, 'secret.txt');

        // the share is reported as protected in the owner's list
        const listResponse = await withToken(superagent.get(`${serverUrl}/api/v1/shares`), alice.token);
        const share = listResponse.body.shares.find((s) => s.id === shareId);
        assert.equal(share.passwordProtected, true);
    });

    it('redirects protected raw links to the password page', async function () {
        await addUserFile(alice.username, '/secret-raw.txt', 'password protected raw');

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({
                ownerUsername: alice.username,
                path: '/secret-raw.txt',
                readonly: true,
                password: 'hunter2'
            });
        const shareId = createResponse.body.shareId;

        const redirectResponse = await superagent.get(`${serverUrl}/api/v1/shares/${shareId}`)
            .query({ type: 'raw' })
            .redirects(0)
            .ok(() => true);
        assert.equal(redirectResponse.status, 302);
        assert.ok(redirectResponse.headers.location.startsWith(`/share-password/${shareId}?returnTo=`));

        // the password page itself is served
        const pageResponse = await superagent.get(`${serverUrl}/share-password/${shareId}`)
            .ok(() => true);
        assert.equal(pageResponse.status, 200);
        assert.match(pageResponse.headers['content-type'], /text\/html/);
    });
});
