import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import common from './common.js';
import files from '../../files.js';
import preview from '../../preview.js';
import superagent from '@cloudron/superagent';
import { MINIMAL_PNG, waitForPreview } from '../../test/preview-helper.js';

describe('preview API', function () {
    const { setup, cleanup, serverUrl, alice, user, withToken, addUserFile } = common;

    before(setup);
    after(cleanup);

    it('returns 404 without authentication for user files', async function () {
        const response = await superagent.get(`${serverUrl}/api/v1/preview/files/${alice.username}/deadbeef`)
            .ok(() => true);
        assert.equal(response.status, 404);
    });

    it('returns 404 for another user preview', async function () {
        const response = await withToken(
            superagent.get(`${serverUrl}/api/v1/preview/files/${alice.username}/deadbeef`),
            user.token
        ).ok(() => true);
        assert.equal(response.status, 404);
    });

    it('returns 404 for unknown preview type', async function () {
        const response = await withToken(
            superagent.get(`${serverUrl}/api/v1/preview/unknown/${alice.username}/deadbeef`),
            alice.token
        ).ok(() => true);
        assert.equal(response.status, 404);
    });

    it('returns 412 while thumbnail is not ready', async function () {
        const fakeHash = crypto.createHash('md5').update('never-enqueued').digest('hex');

        const response = await withToken(
            superagent.get(`${serverUrl}/api/v1/preview/files/${alice.username}/${fakeHash}`),
            alice.token
        ).ok(() => true);
        assert.equal(response.status, 412);
    });

    it('returns thumbnail for own file after generation', async function () {
        await addUserFile(alice.username, '/preview-route.png', MINIMAL_PNG);

        const fullFilePath = files.getAbsolutePath(alice.username, '/preview-route.png');
        const hash = preview.getHash('image/png', fullFilePath);
        await waitForPreview(hash);

        const response = await withToken(
            superagent.get(`${serverUrl}/api/v1/preview/files/${alice.username}/${hash}`),
            alice.token
        ).ok(() => true);
        assert.equal(response.status, 200);
        assert.ok(Number(response.headers['content-length']) > 0);
    });

    it('returns 412 then 200 for public share preview', async function () {
        await addUserFile(alice.username, '/preview-share.png', MINIMAL_PNG);

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({
                ownerUsername: alice.username,
                path: '/preview-share.png',
                readonly: true
            });
        const shareId = createResponse.body.shareId;

        const fullFilePath = files.getAbsolutePath(alice.username, '/preview-share.png');
        const hash = preview.getHash('image/png', fullFilePath);

        const pending = await superagent.get(`${serverUrl}/api/v1/preview/shares/${shareId}/${hash}`)
            .ok(() => true);
        assert.equal(pending.status, 412);

        await waitForPreview(hash);

        const response = await superagent.get(`${serverUrl}/api/v1/preview/shares/${shareId}/${hash}`)
            .ok(() => true);
        assert.equal(response.status, 200);
        assert.ok(Number(response.headers['content-length']) > 0);
    });

    it('returns 404 for unknown share', async function () {
        const response = await superagent.get(`${serverUrl}/api/v1/preview/shares/missing-share-id/deadbeef`)
            .ok(() => true);
        assert.equal(response.status, 404);
    });

    it('returns thumbnail for group folder file', async function () {
        await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), alice.token)
            .send({ slug: 'team', name: 'Team', members: [ alice.username ] });

        await files.addOrOverwriteFileContents('groupfolder-team', '/preview-group.png', MINIMAL_PNG, null, true);

        const fullFilePath = files.getAbsolutePath('groupfolder-team', '/preview-group.png');
        const hash = preview.getHash('image/png', fullFilePath);
        await waitForPreview(hash);

        const response = await withToken(
            superagent.get(`${serverUrl}/api/v1/preview/groups/team/${hash}`),
            alice.token
        ).ok(() => true);
        assert.equal(response.status, 200);
        assert.ok(Number(response.headers['content-length']) > 0);
    });
});
