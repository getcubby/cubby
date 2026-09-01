import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';
import groupfolders from '../../groupfolders.js';

describe('files API', function () {
    const { setup, cleanup, serverUrl, alice, user, withToken, addUserFile } = common;

    before(setup);
    after(cleanup);

    it('requires authentication for home paths', async function () {
        const response = await superagent.get(`${serverUrl}/api/v1/files`)
            .query({ path: '/home/test.txt' })
            .ok(() => true);
        assert.equal(response.status, 401);
    });

    it('can upload and get a file', async function () {
        const response = await withToken(superagent.post(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/home/upload.txt', overwrite: true })
            .send(Buffer.from('uploaded content'));
        assert.equal(response.status, 200);

        const getResponse = await withToken(superagent.get(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/home/upload.txt' });
        assert.equal(getResponse.status, 200);
        assert.equal(getResponse.body.fileName, 'upload.txt');
    });

    it('returns isBinary for files', async function () {
        await addUserFile(alice.username, '/binary.bin', 'hello\0world');
        await addUserFile(alice.username, '/plain.txt', 'hello world');

        const binary = await withToken(superagent.get(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/home/binary.bin' });
        assert.equal(binary.status, 200);
        assert.equal(binary.body.isBinary, true);

        const text = await withToken(superagent.get(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/home/plain.txt' });
        assert.equal(text.status, 200);
        assert.equal(text.body.isBinary, false);
    });

    it('computes isBinary for directory children by default', async function () {
        await addUserFile(alice.username, '/extended/binary.bin', 'hello\0world');
        await addUserFile(alice.username, '/extended/plain.txt', 'hello world');

        const listing = await withToken(superagent.get(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/home/extended/' });
        assert.equal(listing.status, 200);
        assert.equal(listing.body.files.find((f) => f.fileName === 'binary.bin').isBinary, true);
        assert.equal(listing.body.files.find((f) => f.fileName === 'plain.txt').isBinary, false);
    });

    it('can head a file', async function () {
        await addUserFile(alice.username, '/head.txt', 'head content');

        const response = await withToken(superagent.head(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/home/head.txt' })
            .ok(() => true);
        assert.equal(response.status, 200);
    });

    it('can delete a file', async function () {
        await addUserFile(alice.username, '/delete.txt', 'delete me');

        const response = await withToken(superagent.del(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/home/delete.txt' });
        assert.equal(response.status, 200);

        const missing = await withToken(superagent.get(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/home/delete.txt' })
            .ok(() => true);
        assert.equal(missing.status, 404);
    });

    it('viewer cannot write to a group folder but owner can', async function () {
        await groupfolders.add('team', 'Team', alice.username);
        await groupfolders.update('team', 'Team', [
            { username: alice.username, role: 'owner' },
            { username: user.username, role: 'viewer' }
        ]);

        const viewerWrite = await withToken(superagent.post(`${serverUrl}/api/v1/files`), user.token)
            .query({ path: '/groupfolders/team/blocked.txt', overwrite: true })
            .send(Buffer.from('blocked'))
            .ok(() => true);
        assert.equal(viewerWrite.status, 403);

        const ownerWrite = await withToken(superagent.post(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/groupfolders/team/allowed.txt', overwrite: true })
            .send(Buffer.from('allowed'));
        assert.equal(ownerWrite.status, 200);
    });
});
