import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';
import groupfolders from '../../groupfolders.js';
import groups from '../../groups.js';

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

    it('returns 404 when deleting a file that does not exist', async function () {
        const response = await withToken(superagent.del(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/home/does-not-exist.txt' })
            .ok(() => true);
        assert.equal(response.status, 404);
    });

    it('removes shares when a shared folder is deleted and recreated', async function () {
        await addUserFile(alice.username, '/share-folder/inner.txt', 'inner');

        // share the folder itself and a file inside it
        const folderShare = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({ ownerUsername: alice.username, path: '/share-folder', receiverEmail: 'folder@test.local' });
        assert.equal(folderShare.status, 200);

        const innerShare = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({ ownerUsername: alice.username, path: '/share-folder/inner.txt', receiverEmail: 'inner@test.local' });
        assert.equal(innerShare.status, 200);

        const listBefore = await withToken(superagent.get(`${serverUrl}/api/v1/shares`), alice.token);
        assert.equal(listBefore.body.shares.length, 2);

        // delete the folder
        const del = await withToken(superagent.del(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/home/share-folder' });
        assert.equal(del.status, 200);

        // recreate a folder at the very same path
        await addUserFile(alice.username, '/share-folder/inner.txt', 'new inner');

        // the new folder must not inherit the old shares
        const listAfter = await withToken(superagent.get(`${serverUrl}/api/v1/shares`), alice.token);
        assert.equal(listAfter.body.shares.length, 0);

        const folder = await withToken(superagent.get(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/home/share-folder/' });
        assert.equal(folder.body.sharedWith.length, 0);
        assert.equal(folder.body.files.find((f) => f.fileName === 'inner.txt').sharedWith.length, 0);
    });

    it('removes shares when a shared folder is deleted with a trailing slash', async function () {
        await addUserFile(alice.username, '/slash-folder/inner.txt', 'inner');

        await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({ ownerUsername: alice.username, path: '/slash-folder', receiverEmail: 'slash@test.local' });

        // delete with a trailing slash
        const del = await withToken(superagent.del(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/home/slash-folder/' });
        assert.equal(del.status, 200);

        // recreate at the same path
        await addUserFile(alice.username, '/slash-folder/inner.txt', 'new inner');

        const listAfter = await withToken(superagent.get(`${serverUrl}/api/v1/shares`), alice.token);
        assert.equal(listAfter.body.shares.length, 0);
    });

    it('does not remove shares inside similarly-named folders when deleting (underscore)', async function () {
        await addUserFile(alice.username, '/a_b/inner.txt', 'inner');
        await addUserFile(alice.username, '/axb/child.txt', 'child');

        // a share inside a folder whose name differs only by a single character
        const keepShare = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({ ownerUsername: alice.username, path: '/axb/child.txt', receiverEmail: 'keep@test.local' });
        assert.equal(keepShare.status, 200);

        await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({ ownerUsername: alice.username, path: '/a_b', receiverEmail: 'drop@test.local' });

        // deleting /a_b must not delete the share on /axb/child.txt
        await withToken(superagent.del(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/home/a_b' });

        const listAfter = await withToken(superagent.get(`${serverUrl}/api/v1/shares`), alice.token);
        assert.equal(listAfter.body.shares.length, 1);
        assert.equal(listAfter.body.shares[0].filePath, '/axb/child.txt');
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

    it('returns the effective role for group folder viewers via a user group', async function () {
        await groups.add({ id: 'readers', name: 'Readers' });
        await groups.setMembers('readers', [ user.username ]);
        await groupfolders.add('via-group', 'Via Group', alice.username);
        await groupfolders.update('via-group', 'Via Group', [ { username: alice.username, role: 'owner' } ], [ { groupId: 'readers', role: 'viewer' } ]);
        await withToken(superagent.post(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/groupfolders/via-group/doc.txt', overwrite: true })
            .send(Buffer.from('doc'));

        const dir = await withToken(superagent.get(`${serverUrl}/api/v1/files`), user.token).query({ path: '/groupfolders/via-group/' });
        assert.equal(dir.body.group.myRole, 'viewer');
        assert.equal(dir.body.files[0].group.myRole, 'viewer');
        assert.ok(dir.body.group.members);

        const file = await withToken(superagent.get(`${serverUrl}/api/v1/files`), user.token).query({ path: '/groupfolders/via-group/doc.txt' });
        assert.equal(file.body.group.myRole, 'viewer');

        const ownerDir = await withToken(superagent.get(`${serverUrl}/api/v1/files`), alice.token).query({ path: '/groupfolders/via-group/' });
        assert.equal(ownerDir.body.group.myRole, 'owner');

        const root = await withToken(superagent.get(`${serverUrl}/api/v1/files`), user.token).query({ path: '/groupfolders/' });
        const rootEntry = root.body.files.find((f) => f.id === 'via-group');
        assert.equal(rootEntry.group.myRole, 'viewer');

        const settings = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders`), user.token);
        assert.equal(settings.body.groupFolder.find((g) => g.id === 'via-group').myRole, 'viewer');
    });

    it('returns 404 for an unknown group folder', async function () {
        const path = '/groupfolders/no-such-team/file.txt';

        const getResponse = await withToken(superagent.get(`${serverUrl}/api/v1/files`), alice.token).query({ path }).ok(() => true);
        assert.equal(getResponse.status, 404);

        const headResponse = await withToken(superagent.head(`${serverUrl}/api/v1/files`), alice.token).query({ path }).ok(() => true);
        assert.equal(headResponse.status, 404);

        const addResponse = await withToken(superagent.post(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path, overwrite: true })
            .send(Buffer.from('nope'))
            .ok(() => true);
        assert.equal(addResponse.status, 404);

        const updateResponse = await withToken(superagent.put(`${serverUrl}/api/v1/files`), alice.token)
            .query({ action: 'copy', path, new_path: '/home/copy.txt' })
            .ok(() => true);
        assert.equal(updateResponse.status, 404);

        const removeResponse = await withToken(superagent.del(`${serverUrl}/api/v1/files`), alice.token).query({ path }).ok(() => true);
        assert.equal(removeResponse.status, 404);

        const activityResponse = await withToken(superagent.get(`${serverUrl}/api/v1/activity`), alice.token).query({ path }).ok(() => true);
        assert.equal(activityResponse.status, 404);
    });
});
