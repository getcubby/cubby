import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';

describe('favorites API', function () {
    const { setup, cleanup, serverUrl, admin, user, withToken, addUserFile } = common;

    before(setup);
    after(cleanup);

    it('can create, list, get, and remove favorites', async function () {
        await addUserFile(admin.username, '/favorite-api.txt', 'favorite me');

        const createResponse = await withToken(superagent.post(`${serverUrl}/api/v1/favorites`), user.token)
            .send({ path: '/favorite-api.txt', owner: admin.username });
        assert.equal(createResponse.status, 200);
        const favoriteId = createResponse.body.id;
        assert.match(favoriteId, /^[0-9a-f-]{36}$/);

        const listResponse = await withToken(superagent.get(`${serverUrl}/api/v1/favorites`), user.token);
        assert.equal(listResponse.status, 200);
        assert.equal(listResponse.body.favorites.length, 1);
        assert.equal(listResponse.body.favorites[0].filePath, '/favorite-api.txt');
        assert.equal(listResponse.body.favorites[0].owner, admin.username);

        const getResponse = await withToken(superagent.get(`${serverUrl}/api/v1/favorites/${favoriteId}`), user.token);
        assert.equal(getResponse.status, 200);
        assert.equal(getResponse.body.favorite.id, favoriteId);

        const removeResponse = await withToken(superagent.del(`${serverUrl}/api/v1/favorites/${favoriteId}`), user.token);
        assert.equal(removeResponse.status, 200);

        const emptyList = await withToken(superagent.get(`${serverUrl}/api/v1/favorites`), user.token);
        assert.equal(emptyList.body.favorites.length, 0);
    });
});
