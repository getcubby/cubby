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

        await groups.upsertFromScim('gid-1', 'Engineering', [ alice.username, user.username ]);

        const all = await groups.listWithMembers();
        assert.equal(all.length, 1);
        assert.equal(all[0].name, 'Engineering');
        assert.deepEqual(all[0].members, [ alice.username, user.username ]);

        assert.deepEqual(await groups.getMemberUsernames('gid-1'), [ alice.username, user.username ]);
        assert.deepEqual(await groups.getMembershipGroupIds(alice.username), [ 'gid-1' ]);

        await groups.remove('gid-1');
        assert.equal(await groups.get('gid-1'), null);
    });

    it('can update a group and its members', async function () {
        await createUsers();

        await groups.upsertFromScim('gid-1', 'Engineering', [ alice.username ]);
        const result = await groups.upsertFromScim('gid-1', 'Eng', [ user.username ]);
        assert.equal(result.created, false);
        assert.equal(result.updated, true);

        assert.deepEqual(await groups.getMemberUsernames('gid-1'), [ user.username ]);
    });

    it('rejects unknown users in membership', async function () {
        await createUsers();

        const [error] = await safe(groups.upsertFromScim('gid-1', 'Engineering', [ 'missing-user' ]));
        assert.ok(error);
        assert.equal(error.reason, MainError.NOT_FOUND);
    });
});
