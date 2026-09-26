import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';

describe('favorites API', function () {
    const { setup, cleanup, serverUrl, alice, user, withToken, addUserFile } = common;

    before(setup);
    after(cleanup);

    it('can create, list, get, and remove favorites', async function () {
        await addUserFile(alice.username, '/favorite-api.txt', 'favorite me');

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/favorites`), alice.token)
            .send({ path: '/favorite-api.txt', owner: alice.username });
        assert.equal(createResponse.status, 200);
        const favoriteId = createResponse.body.id;
        assert.match(favoriteId, /^[0-9a-f-]{36}$/);

        const listResponse = await withToken(superagent.get(`${serverUrl}/api/v1/favorites`), alice.token);
        assert.equal(listResponse.status, 200);
        assert.equal(listResponse.body.favorites.length, 1);
        assert.equal(listResponse.body.favorites[0].filePath, '/favorite-api.txt');
        assert.equal(listResponse.body.favorites[0].owner, alice.username);

        const getResponse = await withToken(superagent.get(`${serverUrl}/api/v1/favorites/${favoriteId}`), alice.token);
        assert.equal(getResponse.status, 200);
        assert.equal(getResponse.body.favorite.id, favoriteId);

        const removeResponse = await withToken(superagent.del(`${serverUrl}/api/v1/favorites/${favoriteId}`), alice.token);
        assert.equal(removeResponse.status, 200);

        const emptyList = await withToken(superagent.get(`${serverUrl}/api/v1/favorites`), alice.token);
        assert.equal(emptyList.body.favorites.length, 0);
    });

    it('cannot favorite files of another user', async function () {
        await addUserFile(alice.username, '/favorite-not-yours.txt', 'not yours');

        const response = await withToken(superagent.post(`${serverUrl}/api/v1/favorites`), user.token)
            .send({ path: '/favorite-not-yours.txt', owner: alice.username })
            .ok(() => true);
        assert.equal(response.status, 403);
    });

    it('can only favorite group folder files as a member', async function () {
        await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), alice.token)
            .send({ slug: 'favorite-team', name: 'Team' });

        const outsider = await withToken(superagent.post(`${serverUrl}/api/v1/favorites`), user.token)
            .send({ path: '/', owner: 'groupfolder-favorite-team' })
            .ok(() => true);
        assert.equal(outsider.status, 403);

        const unknown = await withToken(superagent.post(`${serverUrl}/api/v1/favorites`), alice.token)
            .send({ path: '/', owner: 'groupfolder-no-such-team' })
            .ok(() => true);
        assert.equal(unknown.status, 403);

        await withToken(superagent.put(`${serverUrl}/api/v1/settings/groupfolders/favorite-team`), alice.token)
            .send({ name: 'Team', members: [ { username: alice.username, role: 'owner' }, { username: user.username, role: 'viewer' } ] });

        const viewer = await withToken(superagent.post(`${serverUrl}/api/v1/favorites`), user.token)
            .send({ path: '/', owner: 'groupfolder-favorite-team' });
        assert.equal(viewer.status, 200);
    });

    it('can only favorite shares the user may receive', async function () {
        await addUserFile(alice.username, '/favorite-share.txt', 'shared with alice only');

        const shareResponse = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({ ownerUsername: alice.username, path: '/favorite-share.txt', receiverUsername: alice.username });
        const shareId = shareResponse.body.shareId;

        const denied = await withToken(superagent.post(`${serverUrl}/api/v1/favorites`), user.token)
            .send({ path: '/', shareId })
            .ok(() => true);
        assert.equal(denied.status, 403);

        const unknown = await withToken(superagent.post(`${serverUrl}/api/v1/favorites`), user.token)
            .send({ path: '/', shareId: 'no-such-share' })
            .ok(() => true);
        assert.equal(unknown.status, 404);
    });

    it('cannot remove a favorite of another user', async function () {
        await addUserFile(alice.username, '/favorite-keep.txt', 'keep me');

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/favorites`), alice.token)
            .send({ path: '/favorite-keep.txt' });
        const favoriteId = createResponse.body.id;

        const removeResponse = await withToken(superagent.del(`${serverUrl}/api/v1/favorites/${favoriteId}`), user.token)
            .ok(() => true);
        assert.equal(removeResponse.status, 404);

        const getResponse = await withToken(superagent.get(`${serverUrl}/api/v1/favorites/${favoriteId}`), alice.token);
        assert.equal(getResponse.status, 200);
    });
});
