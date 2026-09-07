import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';

describe('filedrops API', function () {
    const { setup, cleanup, serverUrl, alice, withToken, addUserFile } = common;

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
});
