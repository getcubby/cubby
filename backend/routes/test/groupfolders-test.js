import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import superagent from '@cloudron/superagent';

describe('groupfolders API', function () {
    const { setup, cleanup, serverUrl, alice, user, withToken } = common;

    before(setup);
    after(cleanup);

    it('allows any authenticated user to list groupfolder settings', async function () {
        const response = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders`), user.token);
        assert.equal(response.status, 200);
        assert.equal(response.body.groupFolder.length, 0);
    });

    it('adds the creator as owner and other members as editor', async function () {
        const addResponse = await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), user.token)
            .send({ slug: 'team', name: 'Team', members: [ alice.username ] });
        assert.equal(addResponse.status, 200);

        const listResponse = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders`), user.token);
        assert.equal(listResponse.status, 200);
        const team = listResponse.body.groupFolder.find((g) => g.id === 'team');
        assert.ok(team);
        assert.deepEqual(team.members, [
            { username: alice.username, role: 'editor' },
            { username: user.username, role: 'owner' }
        ]);
    });

    it('only lists group folders the user is a member of', async function () {
        await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), user.token)
            .send({ slug: 'private', name: 'Private', members: [] });

        const userList = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders`), user.token);
        assert.ok(userList.body.groupFolder.find((g) => g.id === 'private'));

        const aliceList = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders`), alice.token);
        assert.equal(aliceList.body.groupFolder.find((g) => g.id === 'private'), undefined);
    });

    it('rejects a custom path outside /media', async function () {
        const response = await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), user.token)
            .send({ slug: 'evil', name: 'Evil', path: '/etc/foo', members: [] })
            .ok(() => true);
        assert.equal(response.status, 400);

        const traversal = await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), user.token)
            .send({ slug: 'evil2', name: 'Evil2', path: '/media/../../etc', members: [] })
            .ok(() => true);
        assert.equal(traversal.status, 400);
    });

    it('only owners can update or remove a groupfolder', async function () {
        await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), user.token)
            .send({ slug: 'manage', name: 'Team', members: [ alice.username ] });

        const updateDenied = await withToken(superagent.put(`${serverUrl}/api/v1/settings/groupfolders/manage`), alice.token)
            .send({ name: 'Hacked', members: [ { username: alice.username, role: 'owner' } ] })
            .ok(() => true);
        assert.equal(updateDenied.status, 403);

        const removeDenied = await withToken(superagent.del(`${serverUrl}/api/v1/settings/groupfolders/manage`), alice.token)
            .ok(() => true);
        assert.equal(removeDenied.status, 403);

        const update = await withToken(superagent.put(`${serverUrl}/api/v1/settings/groupfolders/manage`), user.token)
            .send({ name: 'Updated Team', members: [ { username: alice.username, role: 'editor' }, { username: user.username, role: 'owner' } ] });
        assert.equal(update.status, 200);

        const updatedList = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders`), user.token);
        const team = updatedList.body.groupFolder.find((g) => g.id === 'manage');
        assert.equal(team.name, 'Updated Team');
        assert.equal(team.members.length, 2);

        const remove = await withToken(superagent.del(`${serverUrl}/api/v1/settings/groupfolders/manage`), user.token);
        assert.equal(remove.status, 200);
    });

    it('an owner cannot change their own role', async function () {
        await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), user.token)
            .send({ slug: 'selfrole', name: 'Team', members: [ alice.username ] });

        const response = await withToken(superagent.put(`${serverUrl}/api/v1/settings/groupfolders/selfrole`), user.token)
            .send({ name: 'Team', members: [ { username: user.username, role: 'editor' } ] })
            .ok(() => true);
        assert.equal(response.status, 403);
    });
});
