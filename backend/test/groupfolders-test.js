import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import paths from '../paths.js';
import common from './common.js';
import fs from 'node:fs';
import groupfolders from '../groupfolders.js';
import groups from '../groups.js';
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

        await groupfolders.add('team', 'Team Folder', alice.id);
        await groupfolders.update('team', 'Team Folder', [
            { userId: alice.id, username: alice.username, role: 'owner' },
            { userId: user.id, username: user.username, role: 'editor' }
        ]);

        const folder = await groupfolders.get('team');
        assert.equal(folder.name, 'Team Folder');
        assert.deepEqual(folder.members, [
            { userId: alice.id, username: alice.username, role: 'owner', active: true },
            { userId: user.id, username: user.username, role: 'editor', active: true }
        ]);
        assert.ok(fs.existsSync(path.join(paths.GROUPS_DATA_ROOT, 'team')));

        const all = await groupfolders.list();
        assert.equal(all.length, 1);

        const forUser = await groupfolders.list(user.id);
        assert.equal(forUser.length, 1);
        assert.ok(await groupfolders.isPartOf(forUser[0], user.id));
        assert.equal(await groupfolders.isPartOf(forUser[0], 'nobody'), false);
    });

    it('assigns roles and helpers', async function () {
        await createUsers();

        await groupfolders.add('team', 'Team', alice.id);
        await groupfolders.update('team', 'Team', [
            { userId: alice.id, username: alice.username, role: 'owner' },
            { userId: user.id, username: user.username, role: 'editor' }
        ]);

        const folder = await groupfolders.get('team');
        assert.equal(await groupfolders.getRole(folder, alice.id), 'owner');
        assert.equal(await groupfolders.getRole(folder, user.id), 'editor');
        assert.equal(await groupfolders.getRole(folder, 'nobody'), null);
        assert.ok(await groupfolders.isOwner(folder, alice.id));
        assert.equal(await groupfolders.isOwner(folder, user.id), false);
    });

    it('rejects duplicate groupfolder ids', async function () {
        await createUsers();

        await groupfolders.add('team', 'Team', alice.id);

        const [error] = await safe(groupfolders.add('team', 'Team Again', alice.id));
        assert.ok(error);
        assert.equal(error.reason, MainError.ALREADY_EXISTS);
    });

    it('rejects unknown owner', async function () {
        const [error] = await safe(groupfolders.add('team', 'Team', 'missing-user'));
        assert.ok(error);
        assert.equal(error.reason, MainError.NOT_FOUND);
    });

    it('adds extra members and keeps the creator as owner', async function () {
        await createUsers();
        await groups.upsertFromScim('gid-1', 'Engineering', [ user.id ]);

        await groupfolders.add('team', 'Team', alice.id, [
            { userId: alice.id, username: alice.username, role: 'editor' },
            { userId: user.id, username: user.username, role: 'viewer' }
        ], [
            { groupId: 'gid-1', role: 'editor' }
        ]);

        const folder = await groupfolders.get('team');
        assert.deepEqual(folder.members, [
            { userId: alice.id, username: alice.username, role: 'owner', active: true },
            { userId: user.id, username: user.username, role: 'viewer', active: true }
        ]);
        assert.deepEqual(folder.groupMembers, [
            { groupId: 'gid-1', role: 'editor', name: 'Engineering', active: true }
        ]);
        assert.equal(await groupfolders.getRole(folder, user.id), 'editor');
    });

    it('can update members and name', async function () {
        await createUsers();

        await groupfolders.add('team', 'Team', alice.id);
        await groupfolders.update('team', 'Updated Team', [
            { userId: alice.id, username: alice.username, role: 'owner' },
            { userId: user.id, username: user.username, role: 'viewer' }
        ]);

        const folder = await groupfolders.get('team');
        assert.equal(folder.name, 'Updated Team');
        assert.deepEqual(folder.members, [
            { userId: alice.id, username: alice.username, role: 'owner', active: true },
            { userId: user.id, username: user.username, role: 'viewer', active: true }
        ]);
    });

    it('can remove a groupfolder', async function () {
        await createUsers();

        await groupfolders.add('team', 'Team', alice.id);
        await groupfolders.remove('team');

        assert.equal(await groupfolders.get('team'), null);
        assert.equal(!fs.existsSync(path.join(paths.GROUPS_DATA_ROOT, 'team')), true);
    });

    it('resolves membership via groups', async function () {
        await createUsers();
        await groups.upsertFromScim('gid-1', 'Engineering', [ user.id ]);

        await groupfolders.add('team', 'Team', alice.id);
        await groupfolders.update('team', 'Team', [
            { userId: alice.id, username: alice.username, role: 'owner' }
        ], [
            { groupId: 'gid-1', role: 'editor' }
        ]);

        const folder = await groupfolders.get('team');
        assert.equal(await groupfolders.isPartOf(folder, user.id), true);
        assert.equal(await groupfolders.getRole(folder, user.id), 'editor');

        const forUser = await groupfolders.list(user.id);
        assert.equal(forUser.length, 1);

        assert.deepEqual((await groupfolders.getMemberUserIds('team')).sort(), [ alice.id, user.id ].sort());
    });

    it('keeps an inactive member when the update still includes them', async function () {
        await createUsers();
        await users.setActive(user.id, false);

        await groupfolders.add('team', 'Team', alice.id);
        await groupfolders.update('team', 'Team', [
            { userId: alice.id, username: alice.username, role: 'owner' },
            { userId: user.id, username: user.username, role: 'editor' }
        ]);

        const folder = await groupfolders.get('team');
        assert.deepEqual(folder.members, [
            { userId: alice.id, username: alice.username, role: 'owner', active: true },
            { userId: user.id, username: user.username, role: 'editor', active: false }
        ]);
        assert.equal(await groupfolders.isPartOf(folder, user.id), true);
    });
});
