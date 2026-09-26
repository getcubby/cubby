import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import database from '../../database.js';
import fs from 'node:fs';
import path from 'node:path';
import paths from '../../paths.js';
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

    it('adds the creator as owner', async function () {
        const addResponse = await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), user.token)
            .send({ slug: 'team', name: 'Team' });
        assert.equal(addResponse.status, 200);

        const listResponse = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders`), user.token);
        assert.equal(listResponse.status, 200);
        const team = listResponse.body.groupFolder.find((g) => g.id === 'team');
        assert.ok(team);
        assert.deepEqual(team.members, [
            { username: user.username, role: 'owner' }
        ]);
    });

    it('only lists group folders the user is a member of', async function () {
        await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), user.token)
            .send({ slug: 'private', name: 'Private' });

        const userList = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders`), user.token);
        assert.ok(userList.body.groupFolder.find((g) => g.id === 'private'));

        const aliceList = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders`), alice.token);
        assert.equal(aliceList.body.groupFolder.find((g) => g.id === 'private'), undefined);
    });

    it('rejects an invalid slug', async function () {
        const response = await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), user.token)
            .send({ slug: '../../etc', name: 'Evil' })
            .ok(() => true);
        assert.equal(response.status, 400);

        const uppercase = await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), user.token)
            .send({ slug: 'Team', name: 'Team' })
            .ok(() => true);
        assert.equal(uppercase.status, 400);
    });

    it('only owners can update or remove a groupfolder', async function () {
        await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), user.token)
            .send({ slug: 'manage', name: 'Team' });

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
            .send({ slug: 'selfrole', name: 'Team' });

        const response = await withToken(superagent.put(`${serverUrl}/api/v1/settings/groupfolders/selfrole`), user.token)
            .send({ name: 'Team', members: [ { username: user.username, role: 'editor' } ] })
            .ok(() => true);
        assert.equal(response.status, 403);
    });

    it('removes a groupfolder with shares, favorites, recents, activity and file drops', async function () {
        await withToken(superagent.post(`${serverUrl}/api/v1/settings/groupfolders`), alice.token)
            .send({ slug: 'busy', name: 'Busy' });

        const upload = await withToken(superagent.post(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/groupfolders/busy/doc.txt' })
            .send(Buffer.from('content'));
        assert.equal(upload.status, 200);

        const share = await withToken(superagent.post(`${serverUrl}/api/v1/shares`), alice.token)
            .send({ ownerGroupfolder: 'busy', path: '/doc.txt', readonly: true });
        assert.equal(share.status, 200);
        const shareId = share.body.shareId;

        const favorite = await withToken(superagent.post(`${serverUrl}/api/v1/favorites`), alice.token)
            .send({ owner: 'groupfolder-busy', path: '/doc.txt' });
        assert.equal(favorite.status, 200);

        const shareFavorite = await withToken(superagent.post(`${serverUrl}/api/v1/favorites`), alice.token)
            .send({ shareId, path: '/' });
        assert.equal(shareFavorite.status, 200);

        const filedrop = await withToken(superagent.post(`${serverUrl}/api/v1/filedrops`), alice.token)
            .send({ ownerGroupfolder: 'busy', path: '/' });
        assert.equal(filedrop.status, 200);

        const raw = await withToken(superagent.get(`${serverUrl}/api/v1/files`), alice.token)
            .query({ path: '/groupfolders/busy/doc.txt', type: 'raw' });
        assert.equal(raw.status, 200);

        const counts = async () => {
            const result = {};
            for (const table of [ 'shares', 'favorites', 'recents', 'file_activity', 'filedrops' ]) {
                const r = await database.query(`SELECT COUNT(*) AS n FROM ${table} WHERE owner_groupfolder = ?`, [ 'busy' ]);
                result[table] = r.rows[0].n;
            }
            return result;
        };

        const before = await counts();
        for (const table of Object.keys(before)) assert.ok(before[table] > 0, `${table} should have rows`);

        const remove = await withToken(superagent.del(`${serverUrl}/api/v1/settings/groupfolders/busy`), alice.token)
            .ok(() => true);
        assert.equal(remove.status, 200);

        const after = await counts();
        for (const table of Object.keys(after)) assert.equal(after[table], 0, `${table} should be empty`);

        const shareFavorites = await database.query('SELECT COUNT(*) AS n FROM favorites WHERE share_id = ?', [ shareId ]);
        assert.equal(shareFavorites.rows[0].n, 0);

        assert.equal(fs.existsSync(path.join(paths.GROUPS_DATA_ROOT, 'busy')), false);
        assert.deepEqual(fs.readdirSync(paths.GROUPS_DATA_ROOT).filter(name => name.startsWith('.deleted-')), []);

        const list = await withToken(superagent.get(`${serverUrl}/api/v1/settings/groupfolders`), alice.token);
        assert.equal(list.body.groupFolder.find((g) => g.id === 'busy'), undefined);
    });
});
