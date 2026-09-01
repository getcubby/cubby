import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import paths from '../paths.js';
import common from './common.js';
import fs from 'node:fs';
import groupfolders from '../groupfolders.js';
import MainError from '../mainerror.js';
import path from 'node:path';
import safe from '@cloudron/safetydance';
import users from '../users.js';

describe('groupfolders', function () {
    const { databaseSetup, cleanup, alice, user } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    async function createUsers() {
        await users.add(alice);
        await users.add(user);
    }

    it('can add, get, and list groupfolders', async function () {
        await createUsers();

        await groupfolders.add('team', 'Team Folder', '', [ alice.username, user.username ]);

        const folder = await groupfolders.get('team');
        assert.equal(folder.name, 'Team Folder');
        assert.deepEqual(folder.members, [
            { username: alice.username, role: 'owner' },
            { username: user.username, role: 'editor' }
        ]);
        assert.ok(fs.existsSync(path.join(paths.GROUPS_DATA_ROOT, 'team')));

        const all = await groupfolders.list();
        assert.equal(all.length, 1);

        const forUser = await groupfolders.list(user.username);
        assert.equal(forUser.length, 1);
        assert.ok(groupfolders.isPartOf(forUser[0], user.username));
        assert.equal(groupfolders.isPartOf(forUser[0], 'nobody'), false);
    });

    it('assigns roles and helpers', async function () {
        await createUsers();

        await groupfolders.add('team', 'Team', '', [ alice.username, user.username ], alice.username);

        const folder = await groupfolders.get('team');
        assert.equal(groupfolders.getRole(folder, alice.username), 'owner');
        assert.equal(groupfolders.getRole(folder, user.username), 'editor');
        assert.equal(groupfolders.getRole(folder, 'nobody'), null);
        assert.ok(groupfolders.isOwner(folder, alice.username));
        assert.equal(groupfolders.isOwner(folder, user.username), false);
        assert.ok(groupfolders.canWrite('owner'));
        assert.ok(groupfolders.canWrite('editor'));
        assert.equal(groupfolders.canWrite('viewer'), false);
    });

    it('rejects duplicate groupfolder ids', async function () {
        await createUsers();

        await groupfolders.add('team', 'Team', '', [ alice.username ]);

        const [error] = await safe(groupfolders.add('team', 'Team Again', '', [ alice.username ]));
        assert.ok(error);
        assert.equal(error.reason, MainError.ALREADY_EXISTS);
    });

    it('rejects unknown members', async function () {
        const [error] = await safe(groupfolders.add('team', 'Team', '', [ 'missing-user' ]));
        assert.ok(error);
        assert.equal(error.reason, MainError.NOT_FOUND);
    });

    it('can update members and name', async function () {
        await createUsers();

        await groupfolders.add('team', 'Team', '', [ alice.username ]);
        await groupfolders.update('team', 'Updated Team', [
            { username: alice.username, role: 'owner' },
            { username: user.username, role: 'viewer' }
        ]);

        const folder = await groupfolders.get('team');
        assert.equal(folder.name, 'Updated Team');
        assert.deepEqual(folder.members, [
            { username: alice.username, role: 'owner' },
            { username: user.username, role: 'viewer' }
        ]);
    });

    it('can remove a groupfolder', async function () {
        await createUsers();

        await groupfolders.add('team', 'Team', '', [ alice.username ]);
        await groupfolders.remove('team');

        assert.equal(await groupfolders.get('team'), null);
        assert.equal(!fs.existsSync(path.join(paths.GROUPS_DATA_ROOT, 'team')), true);
    });
});
