import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';

describe('filedrops API', function () {
    const { setup, cleanup, serverUrl, alice, user, withToken, addUserFile } = common;

    before(setup);
    after(cleanup);

    it('protects a file drop with a password', async function () {
        await addUserFile(alice.username, '/drop.txt', 'dummy');

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/filedrops`), alice.token)
            .send({
                ownerUsername: alice.username,
                path: '/',
                password: 'secret123'
            });
        assert.equal(createResponse.status, 200);
        const filedropId = createResponse.body.filedropId;

        // info is limited before unlock
        const lockedInfo = await superagent.get(`${serverUrl}/api/v1/filedrops/${filedropId}`);
        assert.equal(lockedInfo.status, 200);
        assert.equal(lockedInfo.body.passwordProtected, true);
        assert.equal(lockedInfo.body.folderName, undefined);

        // upload is rejected before unlock
        const lockedUpload = await superagent.post(`${serverUrl}/api/v1/filedrops/${filedropId}`)
            .query({ name: 'uploaded.txt' })
            .send(Buffer.from('content'))
            .ok(() => true);
        assert.equal(lockedUpload.status, 423);

        // wrong password is rejected
        const wrongUnlock = await superagent.post(`${serverUrl}/api/v1/filedrops/${filedropId}/unlock`)
            .send({ password: 'nope' })
            .ok(() => true);
        assert.equal(wrongUnlock.status, 401);

        // correct password unlocks and sets a session cookie
        const unlockResponse = await superagent.post(`${serverUrl}/api/v1/filedrops/${filedropId}/unlock`)
            .send({ password: 'secret123' });
        assert.equal(unlockResponse.status, 200);
        const cookie = (unlockResponse.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
        assert.ok(cookie);

        // full info is now available
        const unlockedInfo = await superagent.get(`${serverUrl}/api/v1/filedrops/${filedropId}`)
            .set('cookie', cookie);
        assert.equal(unlockedInfo.status, 200);
        assert.equal(unlockedInfo.body.passwordProtected, true);
        assert.equal(typeof unlockedInfo.body.folderName, 'string');

        // upload now succeeds
        const uploadResponse = await superagent.post(`${serverUrl}/api/v1/filedrops/${filedropId}`)
            .query({ name: 'uploaded.txt' })
            .set('cookie', cookie)
            .send(Buffer.from('content'));
        assert.equal(uploadResponse.status, 200);
    });

    it('cannot create a file drop in storage of another user', async function () {
        const response = await withToken(superagent.post(`${serverUrl}/api/v1/filedrops`), user.token)
            .send({ ownerUsername: alice.username, path: '/' })
            .ok(() => true);
        assert.equal(response.status, 403);
    });

    it('cannot remove a file drop of another user', async function () {
        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/filedrops`), alice.token)
            .send({ ownerUsername: alice.username, path: '/' });
        const filedropId = createResponse.body.filedropId;

        const removeDenied = await withToken(superagent.del(`${serverUrl}/api/v1/filedrops`), user.token)
            .query({ filedropId })
            .ok(() => true);
        assert.equal(removeDenied.status, 403);

        const removeResponse = await withToken(superagent.del(`${serverUrl}/api/v1/filedrops`), alice.token)
            .query({ filedropId });
        assert.equal(removeResponse.status, 200);
    });

    it('requires write access to create a file drop in a group folder', async function () {
        await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), alice.token)
            .send({ slug: 'drop-team', name: 'Team' });
        await withToken(superagent.put(`${serverUrl}/api/v1/settings/groupfolders/drop-team`), alice.token)
            .send({ name: 'Team', members: [ { username: alice.username, role: 'owner' }, { username: user.username, role: 'viewer' } ] });

        const viewerCreate = await withToken(superagent.post(`${serverUrl}/api/v1/filedrops`), user.token)
            .send({ ownerGroupfolder: 'drop-team', path: '/' })
            .ok(() => true);
        assert.equal(viewerCreate.status, 403);

        const ownerCreate = await withToken(superagent.post(`${serverUrl}/api/v1/filedrops`), alice.token)
            .send({ ownerGroupfolder: 'drop-team', path: '/' });
        assert.equal(ownerCreate.status, 200);
    });
});
