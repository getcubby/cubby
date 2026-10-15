import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import groupfolders from '../groupfolders.js';
import groups from '../groups.js';
import { reconcileScimGroups, reconcileScimUsers } from '../scimSync.js';
import users from '../users.js';

describe('scim user sync', function () {
    const { databaseSetup, cleanup, alice, user } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    it('marks a missing or inactive user inactive and does not create an unknown one', async function () {
        await users.add(alice);
        await users.add(user);

        const stats = await reconcileScimUsers([
            { id: 'gone', username: alice.username, active: false, email: alice.email, displayName: alice.displayName },
            { id: 'never', username: 'nobody', active: false }
        ]);

        assert.equal(stats.deactivated, 2);
        assert.equal(stats.created, 0);
        assert.equal((await users.get(alice.id)).active, false);
        assert.equal((await users.get(user.id)).active, false);
        assert.equal(await users.get('nobody'), null);
        assert.equal(stats.seenUserIds.has('gone'), false);
    });

    it('leaves users active when the SCIM user list is empty', async function () {
        await users.add(alice);

        const stats = await reconcileScimUsers([]);

        assert.equal(stats.deactivated, 0);
        assert.equal((await users.get(alice.id)).active, true);
    });

    it('reactivates a user who returns to the directory', async function () {
        await users.add(user);
        await users.setActive(user.id, false);

        const stats = await reconcileScimUsers([{
            id: 'u-1',
            username: user.username,
            email: 'new@test.local',
            displayName: 'Back',
            active: true
        }]);

        assert.equal(stats.deactivated, 0);
        assert.equal(stats.updated, 1);
        const restored = await users.getByUsername(user.username);
        assert.equal(restored.id, 'u-1');
        assert.equal(restored.active, true);
        assert.equal(restored.email, 'new@test.local');
        assert.equal(stats.seenUserIds.has('u-1'), true);
    });
});

describe('scim group sync', function () {
    const { databaseSetup, cleanup, alice, user } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    it('leaves groups active when the SCIM group list is empty', async function () {
        await users.add(alice);
        await groups.upsertFromScim('gid-1', 'Engineering', [ alice.id ]);

        const stats = await reconcileScimGroups([], new Set());

        assert.equal(stats.deactivated, 0);
        assert.equal((await groups.get('gid-1')).active, true);
    });

    it('marks a missing group inactive and keeps its team folder membership', async function () {
        await users.add(alice);
        await users.add(user);
        await groups.upsertFromScim('gid-1', 'Engineering', [ user.id ]);
        await groupfolders.add('team', 'Team', alice.id, [], [
            { groupId: 'gid-1', role: 'owner' }
        ]);

        const stats = await reconcileScimGroups([{ id: 'gid-other', name: 'Other', memberIds: [] }], new Set());
        assert.equal(stats.deactivated, 1);

        const group = await groups.get('gid-1');
        assert.equal(group.active, false);
        assert.deepEqual(await groups.getMemberUserIds('gid-1'), [ user.id ]);

        const folder = await groupfolders.get('team');
        assert.deepEqual(folder.groupMembers.map((m) => ({ groupId: m.groupId, name: m.name, active: m.active })), [
            { groupId: 'gid-1', name: 'Engineering', active: false }
        ]);
        assert.equal(await groupfolders.getRole(folder, user.id), 'owner');
    });

    it('reactivates a group that returns, with the new member list', async function () {
        await users.add(alice);
        await users.add(user);
        await groups.upsertFromScim('gid-1', 'Engineering', [ user.id ]);
        await groups.setActive('gid-1', false);

        const stats = await reconcileScimGroups([{
            id: 'gid-1',
            name: 'Eng',
            memberIds: [ alice.id ]
        }], new Set([ alice.id ]));

        assert.equal(stats.deactivated, 0);
        assert.equal(stats.updated, 1);

        const group = await groups.get('gid-1');
        assert.equal(group.active, true);
        assert.equal(group.name, 'Eng');
        assert.deepEqual(await groups.getMemberUserIds('gid-1'), [ alice.id ]);
    });
});
