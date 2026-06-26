import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import files from '../files.js';
import relocate from '../relocate.js';
import groupfolders from '../groupfolders.js';
import shares from '../shares.js';
import favorites from '../favorites.js';
import recent from '../recent.js';
import diskusage from '../diskusage.js';
import users from '../users.js';
import MainError from '../mainerror.js';
import safe from '@cloudron/safetydance';

describe('relocate', function () {
    const { databaseSetup, cleanup, admin, user, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    async function createUsers() {
        await users.add(admin);
        await users.add(user);
    }

    it('can move a file within the same owner', async function () {
        await createUsers();
        await addUserFile(admin.username, '/relocate.txt', 'payload');

        await relocate.relocate({
            fromOwner: admin.username,
            fromPath: '/relocate.txt',
            toOwner: admin.username,
            toPath: '/renamed.txt'
        });

        const [missingError] = await safe(files.get(admin.username, '/relocate.txt'));
        assert.equal(missingError.reason, MainError.NOT_FOUND);

        const file = await files.get(admin.username, '/renamed.txt');
        assert.equal(file.fileName, 'renamed.txt');
    });

    it('can move a file across storage roots', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', '', [ user.username ]);
        await addUserFile(admin.username, '/cross-root.txt', 'payload');

        await relocate.relocate({
            fromOwner: admin.username,
            fromPath: '/cross-root.txt',
            toOwner: 'groupfolder-team',
            toPath: '/cross-root.txt'
        });

        const [missingError] = await safe(files.get(admin.username, '/cross-root.txt'));
        assert.equal(missingError.reason, MainError.NOT_FOUND);

        const file = await files.get('groupfolder-team', '/cross-root.txt');
        assert.equal(file.fileName, 'cross-root.txt');
    });

    it('can move a directory tree', async function () {
        await createUsers();
        await files.addDirectory(admin.username, '/tree');
        await addUserFile(admin.username, '/tree/leaf.txt', 'leaf');

        await relocate.relocate({
            fromOwner: admin.username,
            fromPath: '/tree',
            toOwner: admin.username,
            toPath: '/moved-tree'
        });

        const [missingError] = await safe(files.get(admin.username, '/tree/leaf.txt'));
        assert.equal(missingError.reason, MainError.NOT_FOUND);

        const leaf = await files.get(admin.username, '/moved-tree/leaf.txt');
        assert.equal(leaf.fileName, 'leaf.txt');
    });

    it('end-to-end: rename in home updates favorites, recent, and diskusage', async function () {
        await createUsers();
        await files.addDirectory(admin.username, '/docs');
        await addUserFile(admin.username, '/docs/report.txt', 'report-content');

        const favoriteId = await favorites.create(user.username, admin.username, '/docs/report.txt');
        await recent.add(admin.username, '/home/docs/report.txt');

        await diskusage.getByUsernameAndDirectory(admin.username, '/docs');
        const docsSizeBefore = await diskusage.getByUsernameAndDirectory(admin.username, '/docs');

        await relocate.relocate({
            fromOwner: admin.username,
            fromPath: '/docs/report.txt',
            toOwner: admin.username,
            toPath: '/docs/report-renamed.txt'
        });

        assert.equal(await favorites.get(favoriteId), null);
        assert.equal((await favorites.list(user.username))[0].filePath, '/docs/report-renamed.txt');

        const recents = await recent.get(admin.username, 10, 10);
        assert.equal(recents.length, 1);
        assert.equal(recents[0].fileName, 'report-renamed.txt');

        assert.equal(await diskusage.getByUsernameAndDirectory(admin.username, '/docs/report.txt'), 0);
        assert.ok(await diskusage.getByUsernameAndDirectory(admin.username, '/docs') >= docsSizeBefore);
    });

    it('end-to-end: folder move updates shares, favorites, recent, and diskusage', async function () {
        await createUsers();
        await files.addDirectory(admin.username, '/parent-a');
        await files.addDirectory(admin.username, '/parent-a/old-dir');
        await files.addDirectory(admin.username, '/parent-b');
        await addUserFile(admin.username, '/parent-a/old-dir/nested.txt', 'nested');

        const shareId = await shares.create({
            ownerUsername: admin.username,
            filePath: '/parent-a/old-dir',
            receiverUsername: user.username
        });
        const favoriteId = await favorites.create(user.username, admin.username, '/parent-a/old-dir/nested.txt');
        await recent.add(admin.username, '/home/parent-a/old-dir/nested.txt');

        await diskusage.getByUsernameAndDirectory(admin.username, '/parent-a/old-dir');
        await diskusage.getByUsernameAndDirectory(admin.username, '/parent-b');

        await relocate.relocate({
            fromOwner: admin.username,
            fromPath: '/parent-a/old-dir',
            toOwner: admin.username,
            toPath: '/parent-b/new-dir'
        });

        assert.equal((await shares.get(shareId)).filePath, '/parent-b/new-dir');

        assert.equal(await favorites.get(favoriteId), null);
        assert.equal((await favorites.list(user.username))[0].filePath, '/parent-b/new-dir/nested.txt');

        const recents = await recent.get(admin.username, 10, 10);
        assert.equal(recents.length, 1);
        assert.equal(recents[0].fileName, 'nested.txt');

        assert.equal(await diskusage.getByUsernameAndDirectory(admin.username, '/parent-a/old-dir'), 0);
        assert.ok(await diskusage.getByUsernameAndDirectory(admin.username, '/parent-b/new-dir') > 0);
    });

    it('end-to-end: home to groupfolder updates all metadata', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', '', [ user.username, admin.username ]);
        await addUserFile(admin.username, '/cross.txt', 'cross');

        const shareId = await shares.create({
            ownerUsername: admin.username,
            filePath: '/cross.txt',
            receiverUsername: user.username
        });
        const favoriteId = await favorites.create(user.username, admin.username, '/cross.txt');
        await recent.add(admin.username, '/home/cross.txt');

        await diskusage.getByUsernameAndDirectory(admin.username, '/');
        await diskusage.getByUsernameAndDirectory('groupfolder-team', '/');
        const homeUsedBefore = (await diskusage.getByUsername(admin.username)).used;

        await relocate.relocate({
            fromOwner: admin.username,
            fromPath: '/cross.txt',
            toOwner: 'groupfolder-team',
            toPath: '/cross.txt'
        });

        const share = await shares.get(shareId);
        assert.equal(share.filePath, '/cross.txt');
        assert.equal(share.ownerUsername, null);
        assert.equal(share.ownerGroupfolder, 'team');

        const favorite = await favorites.get(favoriteId);
        assert.equal(favorite.filePath, '/cross.txt');
        assert.equal(favorite.owner, 'groupfolder-team');

        const recents = await recent.get(admin.username, 10, 10);
        assert.equal(recents.length, 1);
        assert.equal(recents[0].fileName, 'cross.txt');

        assert.ok((await diskusage.getByUsername(admin.username)).used < homeUsedBefore);
        assert.ok((await diskusage.getByUsername('groupfolder-team')).used > 0);
    });

    it('end-to-end: groupfolder to home updates all metadata', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', '', [ admin.username ]);
        await addUserFile('groupfolder-team', '/back.txt', 'back');

        const shareId = await shares.create({
            ownerGroupfolder: 'team',
            filePath: '/back.txt',
            receiverUsername: user.username
        });
        const favoriteId = await favorites.create(admin.username, 'groupfolder-team', '/back.txt');
        await recent.add(admin.username, '/groupfolders/team/back.txt');

        await diskusage.getByUsernameAndDirectory('groupfolder-team', '/');
        await diskusage.getByUsernameAndDirectory(admin.username, '/');
        const groupUsedBefore = (await diskusage.getByUsername('groupfolder-team')).used;

        await relocate.relocate({
            fromOwner: 'groupfolder-team',
            fromPath: '/back.txt',
            toOwner: admin.username,
            toPath: '/back.txt'
        });

        const share = await shares.get(shareId);
        assert.equal(share.filePath, '/back.txt');
        assert.equal(share.ownerUsername, admin.username);
        assert.equal(share.ownerGroupfolder, null);

        const favorite = await favorites.get(favoriteId);
        assert.equal(favorite.filePath, '/back.txt');
        assert.equal(favorite.owner, admin.username);

        const recents = await recent.get(admin.username, 10, 10);
        assert.equal(recents.length, 1);
        assert.equal(recents[0].fileName, 'back.txt');

        assert.ok((await diskusage.getByUsername('groupfolder-team')).used < groupUsedBefore);
        assert.ok((await diskusage.getByUsername(admin.username)).used > 0);
    });
});
