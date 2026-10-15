import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import diskusage from '../diskusage.js';
import files from '../files.js';
import relocate from '../relocate.js';
import groupfolders from '../groupfolders.js';
import users from '../users.js';

describe('diskusage', function () {
    const { databaseSetup, cleanup, alice, user, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    async function createUsers() {
        await users.add(alice);
        await users.add(user);
    }

    it('updates cached folder size after upload using logical paths', async function () {
        await createUsers();
        await addUserFile(alice.username, '/docs/readme.txt', 'hello world');

        const size = await diskusage.getByUsernameAndDirectory(alice.id, '/docs');
        assert.ok(size > 0);
    });

    it('updates both owners after cross-root move', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', user.id);
        await addUserFile(alice.username, '/move-me.txt', 'payload');

        await relocate.relocate({
            fromOwner: alice.id,
            fromPath: '/move-me.txt',
            toOwner: 'groupfolder-team',
            toPath: '/move-me.txt'
        });

        const homeSize = await diskusage.getByUsernameAndDirectory(alice.id, '/');
        const groupSize = await diskusage.getByUsernameAndDirectory('groupfolder-team', '/');

        assert.equal(await diskusage.getByUsernameAndDirectory(alice.id, '/move-me.txt'), 0);
        assert.ok(groupSize > 0);
        assert.ok(homeSize >= 0);
    });

    it('removes stale cache entries after delete', async function () {
        await createUsers();
        await files.addDirectory(alice.id, '/stale');
        await addUserFile(alice.username, '/stale/keep.txt', 'keep');
        await addUserFile(alice.username, '/stale/remove.txt', 'remove-me');

        assert.ok(await diskusage.getByUsernameAndDirectory(alice.id, '/stale') > 0);

        await files.remove(alice.id, '/stale/remove.txt');

        assert.equal(await diskusage.getByUsernameAndDirectory(alice.id, '/stale/remove.txt'), 0);
        assert.ok(await diskusage.getByUsernameAndDirectory(alice.id, '/stale') > 0);
    });

    it('updates ancestor folder sizes after nested file changes', async function () {
        await createUsers();
        await files.addDirectory(alice.id, '/parent');
        await files.addDirectory(alice.id, '/parent/child');
        await addUserFile(alice.username, '/parent/child/nested.txt', '0123456789');

        const sizeWithFile = await diskusage.getByUsernameAndDirectory(alice.id, '/parent');
        assert.ok(sizeWithFile > 0);

        await files.remove(alice.id, '/parent/child/nested.txt');

        const sizeAfterDelete = await diskusage.getByUsernameAndDirectory(alice.id, '/parent');
        assert.ok(sizeAfterDelete < sizeWithFile);
    });
});
