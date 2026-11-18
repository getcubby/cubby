import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import groups from '../groups.js';
import MainError from '../mainerror.js';
import safe from '@cloudron/safetydance';
import users from '../users.js';

describe('groups', function () {
    const { databaseSetup, cleanup, alice, user } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    async function createUsers() {
        await users.add(alice);
        await users.add(user);
    }

    it('can add, list and remove groups with members', async function () {
        await createUsers();

        await groups.upsertFromScim('gid-1', 'Engineering', [ alice.id, user.id ]);

        const all = await groups.listWithMembers();
        assert.equal(all.length, 1);
        assert.equal(all[0].name, 'Engineering');
        assert.deepEqual(all[0].members, [ { id: alice.id, username: alice.username }, { id: user.id, username: user.username } ]);

        assert.deepEqual(await groups.getMemberUserIds('gid-1'), [ alice.id, user.id ].sort());
        assert.deepEqual(await groups.getMembershipGroupIds(alice.id), [ 'gid-1' ]);

        await groups.remove('gid-1');
        assert.equal(await groups.get('gid-1'), null);
    });

    it('can update a group and its members', async function () {
        await createUsers();

        const created = await groups.upsertFromScim('gid-1', 'Engineering', [ alice.id ]);
        assert.deepEqual(created.changedUserIds, [ alice.id ]);

        const result = await groups.upsertFromScim('gid-1', 'Eng', [ user.id ]);
        assert.equal(result.created, false);
        assert.equal(result.updated, true);
        assert.deepEqual(result.changedUserIds.sort(), [ alice.id, user.id ].sort());

        assert.deepEqual(await groups.getMemberUserIds('gid-1'), [ user.id ]);
        assert.equal((await groups.get('gid-1')).active, true);
    });

    it('does not report an update when nothing changed', async function () {
        await createUsers();

        await groups.upsertFromScim('gid-1', 'Engineering', [ alice.id, user.id ]);
        const result = await groups.upsertFromScim('gid-1', 'Engineering', [ user.id, alice.id ]);
        assert.equal(result.created, false);
        assert.equal(result.updated, false);
        assert.deepEqual(result.changedUserIds, []);
    });

    it('reports no membership change on a rename', async function () {
        await createUsers();

        await groups.upsertFromScim('gid-1', 'Engineering', [ alice.id ]);
        const result = await groups.upsertFromScim('gid-1', 'Eng', [ alice.id ]);
        assert.equal(result.updated, true);
        assert.deepEqual(result.changedUserIds, []);
    });

    it('reports an update when an inactive group returns unchanged', async function () {
        await createUsers();

        await groups.upsertFromScim('gid-1', 'Engineering', [ alice.id ]);
        await groups.setActive('gid-1', false);

        const result = await groups.upsertFromScim('gid-1', 'Engineering', [ alice.id ]);
        assert.equal(result.updated, true);
        assert.equal((await groups.get('gid-1')).active, true);
    });

    it('keeps members when a group is marked inactive', async function () {
        await createUsers();

        await groups.upsertFromScim('gid-1', 'Engineering', [ alice.id, user.id ]);
        await groups.setActive('gid-1', false);

        const group = await groups.get('gid-1');
        assert.equal(group.active, false);
        assert.deepEqual(await groups.getMemberUserIds('gid-1'), [ alice.id, user.id ].sort());
    });

    it('rejects unknown users in membership', async function () {
        await createUsers();

        const [error] = await safe(groups.upsertFromScim('gid-1', 'Engineering', [ 'missing-user' ]));
        assert.ok(error);
        assert.equal(error.reason, MainError.NOT_FOUND);
    });
});
