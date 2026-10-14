import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import groupfolders from '../groupfolders.js';
import groups from '../groups.js';
import { reconcileScimGroups } from '../scimSync.js';
import users from '../users.js';

describe('scim group sync', function () {
    const { databaseSetup, cleanup, alice, user } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    it('marks a missing group inactive and keeps its team folder membership', async function () {
        await users.add(alice);
        await users.add(user);
        await groups.upsertFromScim('gid-1', 'Engineering', [ user.username ]);
        await groupfolders.add('team', 'Team', alice.username, [], [
            { groupId: 'gid-1', role: 'owner' }
        ]);

        const stats = await reconcileScimGroups([], new Map());
        assert.equal(stats.deactivated, 1);

        const group = await groups.get('gid-1');
        assert.equal(group.active, false);
        assert.deepEqual(await groups.getMemberUsernames('gid-1'), [ user.username ]);

        const folder = await groupfolders.get('team');
        assert.deepEqual(folder.groupMembers.map((m) => m.groupId), [ 'gid-1' ]);
        assert.equal(await groupfolders.getRole(folder, user.username), 'owner');
    });

    it('reactivates a group that returns, with the new member list', async function () {
        await users.add(alice);
        await users.add(user);
        await groups.upsertFromScim('gid-1', 'Engineering', [ user.username ]);
        await groups.setActive('gid-1', false);

        const idToUsername = new Map([[ 'scim-alice', alice.username ]]);
        const stats = await reconcileScimGroups([{
            id: 'gid-1',
            name: 'Eng',
            memberIds: [ 'scim-alice' ]
        }], idToUsername);

        assert.equal(stats.deactivated, 0);
        assert.equal(stats.updated, 1);

        const group = await groups.get('gid-1');
        assert.equal(group.active, true);
        assert.equal(group.name, 'Eng');
        assert.deepEqual(await groups.getMemberUsernames('gid-1'), [ alice.username ]);
    });
});
