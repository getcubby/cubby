import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import diskusage from '../diskusage.js';
import files from '../files.js';
import relocate from '../relocate.js';
import groupfolders from '../groupfolders.js';
import users from '../users.js';

describe('diskusage', function () {
    const { databaseSetup, cleanup, admin, user, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    async function createUsers() {
        await users.add(admin);
        await users.add(user);
    }

    it('updates cached folder size after upload using logical paths', async function () {
        await createUsers();
        await addUserFile(admin.username, '/docs/readme.txt', 'hello world');

        const size = await diskusage.getByUsernameAndDirectory(admin.username, '/docs');
        assert.ok(size > 0);
    });

    it('updates both owners after cross-root move', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', '', [ user.username ]);
        await addUserFile(admin.username, '/move-me.txt', 'payload');

        await relocate.relocate({
            fromOwner: admin.username,
            fromPath: '/move-me.txt',
            toOwner: 'groupfolder-team',
            toPath: '/move-me.txt'
        });

        const homeSize = await diskusage.getByUsernameAndDirectory(admin.username, '/');
        const groupSize = await diskusage.getByUsernameAndDirectory('groupfolder-team', '/');

        assert.equal(await diskusage.getByUsernameAndDirectory(admin.username, '/move-me.txt'), 0);
        assert.ok(groupSize > 0);
        assert.ok(homeSize >= 0);
    });

    it('removes stale cache entries after delete', async function () {
        await createUsers();
        await files.addDirectory(admin.username, '/stale');
        await addUserFile(admin.username, '/stale/keep.txt', 'keep');
        await addUserFile(admin.username, '/stale/remove.txt', 'remove-me');

        assert.ok(await diskusage.getByUsernameAndDirectory(admin.username, '/stale') > 0);

        await files.remove(admin.username, '/stale/remove.txt');

        assert.equal(await diskusage.getByUsernameAndDirectory(admin.username, '/stale/remove.txt'), 0);
        assert.ok(await diskusage.getByUsernameAndDirectory(admin.username, '/stale') > 0);
    });

    it('updates ancestor folder sizes after nested file changes', async function () {
        await createUsers();
        await files.addDirectory(admin.username, '/parent');
        await files.addDirectory(admin.username, '/parent/child');
        await addUserFile(admin.username, '/parent/child/nested.txt', '0123456789');

        const sizeWithFile = await diskusage.getByUsernameAndDirectory(admin.username, '/parent');
        assert.ok(sizeWithFile > 0);

        await files.remove(admin.username, '/parent/child/nested.txt');

        const sizeAfterDelete = await diskusage.getByUsernameAndDirectory(admin.username, '/parent');
        assert.ok(sizeAfterDelete < sizeWithFile);
    });
});
