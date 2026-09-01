import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';

describe('groupfolders API', function () {
    const { setup, cleanup, serverUrl, admin, user, withToken } = common;

    before(setup);
    after(cleanup);

    it('allows any authenticated user to list groupfolder settings', async function () {
        const response = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders`), user.token);
        assert.equal(response.status, 200);
        assert.equal(response.body.groupFolder.length, 0);
    });

    it('can add, list, update, and remove groupfolders', async function () {
        const addResponse = await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), user.token)
            .send({ slug: 'team', name: 'Team', members: [ user.username ] });
        assert.equal(addResponse.status, 200);

        const listResponse = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders`), user.token);
        assert.equal(listResponse.status, 200);
        assert.equal(listResponse.body.groupFolder.length, 1);
        assert.equal(listResponse.body.groupFolder[0].id, 'team');

        const updateResponse = await withToken(superagent.put(`${serverUrl}/api/v1/settings/groupfolders/team`), user.token)
            .send({ name: 'Updated Team', members: [ admin.username, user.username ] });
        assert.equal(updateResponse.status, 200);

        const updatedList = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders`), user.token);
        assert.equal(updatedList.body.groupFolder[0].name, 'Updated Team');
        assert.equal(updatedList.body.groupFolder[0].members.length, 2);

        const removeResponse = await withToken(superagent.del(`${serverUrl}/api/v1/settings/groupfolders/team`), user.token);
        assert.equal(removeResponse.status, 200);

        const emptyList = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders`), user.token);
        assert.equal(emptyList.body.groupFolder.length, 0);
    });

    it('returns not implemented for get by id', async function () {
        const response = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders/missing`), admin.token).ok(() => true);
        assert.equal(response.status, 409);
    });
});
