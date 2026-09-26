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

    it('returns 404 when the hash does not belong to the path', async function () {
        await addUserFile(alice.username, '/mismatch.png', MINIMAL_PNG);
        const fakeHash = crypto.createHash('md5').update('never-enqueued').digest('hex');

        const response = await withToken(
            superagent.get(`${serverUrl}/api/v1/preview/files/${alice.username}/${fakeHash}`).query({ path: '/mismatch.png' }),
            alice.token
        ).ok(() => true);
        assert.equal(response.status, 404);
    });

    it('returns 404 without a path', async function () {
        await addUserFile(alice.username, '/nopath.png', MINIMAL_PNG);
        const hash = preview.getHash('image/png', files.getAbsolutePath(alice.username, '/nopath.png'));
        await waitForPreview(hash);

        const response = await withToken(
            superagent.get(`${serverUrl}/api/v1/preview/files/${alice.username}/${hash}`),
            alice.token
        ).ok(() => true);
        assert.equal(response.status, 404);
    });

    it('returns thumbnail for own file after generation', async function () {
        await addUserFile(alice.username, '/preview-route.png', MINIMAL_PNG);

        const fullFilePath = files.getAbsolutePath(alice.username, '/preview-route.png');
        const hash = preview.getHash('image/png', fullFilePath);
        await waitForPreview(hash);

        const response = await withToken(
            superagent.get(`${serverUrl}/api/v1/preview/files/${alice.username}/${hash}`).query({ path: '/preview-route.png' }),
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
            .query({ path: '/' })
            .ok(() => true);
        assert.equal(pending.status, 412);

        await waitForPreview(hash);

        const response = await superagent.get(`${serverUrl}/api/v1/preview/shares/${shareId}/${hash}`)
            .query({ path: '/' })
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
            superagent.get(`${serverUrl}/api/v1/preview/groups/team/${hash}`).query({ path: '/preview-group.png' }),
            alice.token
        ).ok(() => true);
        assert.equal(response.status, 200);
        assert.ok(Number(response.headers['content-length']) > 0);
    });

    it('does not serve thumbnails outside of a public share', async function () {
        await addUserFile(alice.username, '/public/visible.png', MINIMAL_PNG);
        await addUserFile(alice.username, '/private/secret.png', MINIMAL_PNG);

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({ ownerUsername: alice.username, path: '/public', readonly: true });
        const shareId = createResponse.body.shareId;

        const visibleHash = preview.getHash('image/png', files.getAbsolutePath(alice.username, '/public/visible.png'));
        const secretHash = preview.getHash('image/png', files.getAbsolutePath(alice.username, '/private/secret.png'));
        await waitForPreview(visibleHash);
        await waitForPreview(secretHash);

        const visible = await superagent.get(`${serverUrl}/api/v1/preview/shares/${shareId}/${visibleHash}`)
            .query({ path: '/visible.png' })
            .ok(() => true);
        assert.equal(visible.status, 200);

        for (const filePath of [ '/visible.png', '/../private/secret.png', '/../../alice/private/secret.png' ]) {
            const response = await superagent.get(`${serverUrl}/api/v1/preview/shares/${shareId}/${secretHash}`)
                .query({ path: filePath })
                .ok(() => true);
            assert.equal(response.status, 404, filePath);
        }
    });

    it('does not serve thumbnails of another user', async function () {
        await addUserFile(alice.username, '/mine.png', MINIMAL_PNG);
        const hash = preview.getHash('image/png', files.getAbsolutePath(alice.username, '/mine.png'));
        await waitForPreview(hash);

        const response = await withToken(
            superagent.get(`${serverUrl}/api/v1/preview/files/${user.username}/${hash}`).query({ path: `/../${alice.username}/mine.png` }),
            user.token
        ).ok(() => true);
        assert.equal(response.status, 404);
    });

    it('lists files with a preview url that resolves', async function () {
        await addUserFile(alice.username, '/listed/pic.png', MINIMAL_PNG);

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({ ownerUsername: alice.username, path: '/listed', readonly: true });
        const shareId = createResponse.body.shareId;

        const listing = await superagent.get(`${serverUrl}/api/v1/files`).query({ path: `/shares/${shareId}/` });
        assert.equal(listing.status, 200);
        const pic = listing.body.files.find(f => f.fileName === 'pic.png');
        assert.match(pic.previewUrl, new RegExp(`^/api/v1/preview/shares/${shareId}/[0-9a-f]+\\?path=%2Fpic\\.png$`));

        await waitForPreview(pic.previewUrl.split('/')[6].split('?')[0]);
        const response = await superagent.get(`${serverUrl}${pic.previewUrl}`).ok(() => true);
        assert.equal(response.status, 200);

        const home = await withToken(superagent.get(`${serverUrl}/api/v1/files`).query({ path: '/home/listed/' }), alice.token);
        const homePic = home.body.files.find(f => f.fileName === 'pic.png');
        const homeResponse = await withToken(superagent.get(`${serverUrl}${homePic.previewUrl}`), alice.token).ok(() => true);
        assert.equal(homeResponse.status, 200);

        await addUserFile(alice.username, '/listed/pic (1).png', MINIMAL_PNG);
        const again = await withToken(superagent.get(`${serverUrl}/api/v1/files`).query({ path: '/home/listed/' }), alice.token);
        const parenPic = again.body.files.find(f => f.fileName === 'pic (1).png');
        assert.doesNotMatch(parenPic.previewUrl, /[()\s]/);
        await waitForPreview(parenPic.previewUrl.split('/')[6].split('?')[0]);
        const parenResponse = await withToken(superagent.get(`${serverUrl}${parenPic.previewUrl}`), alice.token).ok(() => true);
        assert.equal(parenResponse.status, 200);
    });
});
