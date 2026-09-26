import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';

describe('webdav', function () {
    const { setup, cleanup, serverUrl, alice, user, withToken, addUserFile } = common;

    before(setup);
    after(cleanup);

    function dav(method, davPath) {
        return superagent.request(method, `${serverUrl}/webdav/${user.username}/${davPath}`)
            .auth(user.username, 'password')
            .ok(() => true);
    }

    async function createLinkShare(filePath, password) {
        await addUserFile(alice.username, `${filePath}/file.txt`, 'shared content');
        const response = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({ ownerUsername: alice.username, path: filePath, readonly: false, password });
        assert.equal(response.status, 200);
        return response.body.shareId;
    }

    it('can access a link share without password', async function () {
        const shareId = await createLinkShare('/open-dir', null);

        const propfind = await dav('PROPFIND', `shares/${shareId}/`).set('Depth', '1');
        assert.equal(propfind.status, 207);

        const get = await dav('GET', `shares/${shareId}/file.txt`);
        assert.equal(get.status, 200);
        assert.equal(get.text, 'shared content');
    });

    it('refuses a password protected link share', async function () {
        const shareId = await createLinkShare('/locked-dir', 'hunter2');

        const propfind = await dav('PROPFIND', `shares/${shareId}/`).set('Depth', '1');
        assert.equal(propfind.status, 423);

        const get = await dav('GET', `shares/${shareId}/file.txt`);
        assert.equal(get.status, 423);

        const head = await dav('HEAD', `shares/${shareId}/file.txt`);
        assert.equal(head.status, 423);

        const put = await dav('PUT', `shares/${shareId}/new.txt`).send(Buffer.from('new'));
        assert.equal(put.status, 423);

        const mkcol = await dav('MKCOL', `shares/${shareId}/newdir`);
        assert.equal(mkcol.status, 423);

        const del = await dav('DELETE', `shares/${shareId}/file.txt`);
        assert.equal(del.status, 423);

        const copyOut = await dav('COPY', `shares/${shareId}/file.txt`)
            .set('Destination', `${serverUrl}/webdav/${user.username}/home/stolen.txt`);
        assert.equal(copyOut.status, 423);

        await addUserFile(user.username, '/mine.txt', 'mine');
        const moveIn = await dav('MOVE', 'home/mine.txt')
            .set('Destination', `${serverUrl}/webdav/${user.username}/shares/${shareId}/mine.txt`);
        assert.equal(moveIn.status, 423);

        const content = await withToken(superagent.get(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/home/locked-dir/' });
        assert.deepEqual(content.body.files.map((f) => f.fileName), [ 'file.txt' ]);
    });
});
