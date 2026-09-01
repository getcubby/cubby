import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import files from '../files.js';
import relocate from '../relocate.js';
import groupfolders from '../groupfolders.js';
import shares from '../shares.js';
import favorites from '../favorites.js';
import recent from '../recent.js';
import activity from '../activity.js';
import diskusage from '../diskusage.js';
import users from '../users.js';
import MainError from '../mainerror.js';
import safe from '@cloudron/safetydance';

describe('relocate', function () {
    const { databaseSetup, cleanup, alice, user, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    async function createUsers() {
        await users.add(alice);
        await users.add(user);
    }

    it('can move a file within the same owner', async function () {
        await createUsers();
        await addUserFile(alice.username, '/relocate.txt', 'payload');

        await relocate.relocate({
            actor: alice.username,
            fromOwner: alice.username,
            fromPath: '/relocate.txt',
            toOwner: alice.username,
            toPath: '/renamed.txt'
        });

        const [missingError] = await safe(files.get(alice.username, '/relocate.txt'));
        assert.equal(missingError.reason, MainError.NOT_FOUND);

        const file = await files.get(alice.username, '/renamed.txt');
        assert.equal(file.fileName, 'renamed.txt');

        const activityItems = await activity.listByPath(alice.username, '/renamed.txt');
        assert.equal(activityItems.length, 1);
        assert.equal(activityItems[0].action, 'moved');
        assert.equal(activityItems[0].details.toPath, '/renamed.txt');
    });

    it('can move a file across storage roots', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', '', [ user.username ]);
        await addUserFile(alice.username, '/cross-root.txt', 'payload');

        await relocate.relocate({
            fromOwner: alice.username,
            fromPath: '/cross-root.txt',
            toOwner: 'groupfolder-team',
            toPath: '/cross-root.txt'
        });

        const [missingError] = await safe(files.get(alice.username, '/cross-root.txt'));
        assert.equal(missingError.reason, MainError.NOT_FOUND);

        const file = await files.get('groupfolder-team', '/cross-root.txt');
        assert.equal(file.fileName, 'cross-root.txt');
    });

    it('can move a directory tree', async function () {
        await createUsers();
        await files.addDirectory(alice.username, '/tree');
        await addUserFile(alice.username, '/tree/leaf.txt', 'leaf');

        await relocate.relocate({
            fromOwner: alice.username,
            fromPath: '/tree',
            toOwner: alice.username,
            toPath: '/moved-tree'
        });

        const [missingError] = await safe(files.get(alice.username, '/tree/leaf.txt'));
        assert.equal(missingError.reason, MainError.NOT_FOUND);

        const leaf = await files.get(alice.username, '/moved-tree/leaf.txt');
        assert.equal(leaf.fileName, 'leaf.txt');
    });

    it('end-to-end: rename in home updates favorites, recent, and diskusage', async function () {
        await createUsers();
        await files.addDirectory(alice.username, '/docs');
        await addUserFile(alice.username, '/docs/report.txt', 'report-content');

        const favoriteId = await favorites.create(user.username, { owner: alice.username, filePath: '/docs/report.txt' });
        await recent.add(alice.username, '/home/docs/report.txt');

        await diskusage.getByUsernameAndDirectory(alice.username, '/docs');
        const docsSizeBefore = await diskusage.getByUsernameAndDirectory(alice.username, '/docs');

        await relocate.relocate({
            fromOwner: alice.username,
            fromPath: '/docs/report.txt',
            toOwner: alice.username,
            toPath: '/docs/report-renamed.txt'
        });

        const favorite = await favorites.get(favoriteId);
        assert.equal(favorite.filePath, '/docs/report-renamed.txt');

        const recents = await recent.list(alice.username, 10, 10);
        assert.equal(recents.length, 1);
        assert.equal(recents[0].filePath, '/docs/report-renamed.txt');

        assert.equal(await diskusage.getByUsernameAndDirectory(alice.username, '/docs/report.txt'), 0);
        assert.ok(await diskusage.getByUsernameAndDirectory(alice.username, '/docs') >= docsSizeBefore);
    });

    it('end-to-end: folder move updates shares, favorites, recent, and diskusage', async function () {
        await createUsers();
        await files.addDirectory(alice.username, '/parent-a');
        await files.addDirectory(alice.username, '/parent-a/old-dir');
        await files.addDirectory(alice.username, '/parent-b');
        await addUserFile(alice.username, '/parent-a/old-dir/nested.txt', 'nested');

        const shareId = await shares.create({
            ownerUsername: alice.username,
            filePath: '/parent-a/old-dir',
            receiverUsername: user.username
        });
        const favoriteId = await favorites.create(user.username, { owner: alice.username, filePath: '/parent-a/old-dir/nested.txt' });
        await recent.add(alice.username, '/home/parent-a/old-dir/nested.txt');

        await diskusage.getByUsernameAndDirectory(alice.username, '/parent-a/old-dir');
        await diskusage.getByUsernameAndDirectory(alice.username, '/parent-b');

        await relocate.relocate({
            fromOwner: alice.username,
            fromPath: '/parent-a/old-dir',
            toOwner: alice.username,
            toPath: '/parent-b/new-dir'
        });

        assert.equal((await shares.get(shareId)).filePath, '/parent-b/new-dir');

        const movedFavorite = await favorites.get(favoriteId);
        assert.equal(movedFavorite.filePath, '/parent-b/new-dir/nested.txt');

        const recents = await recent.list(alice.username, 10, 10);
        assert.equal(recents.length, 1);
        assert.equal(recents[0].filePath, '/parent-b/new-dir/nested.txt');

        assert.equal(await diskusage.getByUsernameAndDirectory(alice.username, '/parent-a/old-dir'), 0);
        assert.ok(await diskusage.getByUsernameAndDirectory(alice.username, '/parent-b/new-dir') > 0);
    });

    it('end-to-end: home to groupfolder updates all metadata', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', '', [ user.username, alice.username ]);
        await addUserFile(alice.username, '/cross.txt', 'cross');

        const shareId = await shares.create({
            ownerUsername: alice.username,
            filePath: '/cross.txt',
            receiverUsername: user.username
        });
        const favoriteId = await favorites.create(user.username, { owner: alice.username, filePath: '/cross.txt' });
        await recent.add(alice.username, '/home/cross.txt');

        await diskusage.getByUsernameAndDirectory(alice.username, '/');
        await diskusage.getByUsernameAndDirectory('groupfolder-team', '/');
        const homeUsedBefore = (await diskusage.getByUsername(alice.username)).used;

        await relocate.relocate({
            fromOwner: alice.username,
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

        const recents = await recent.list(alice.username, 10, 10);
        assert.equal(recents.length, 1);
        assert.equal(recents[0].filePath, '/cross.txt');
        assert.equal(recents[0].owner, 'groupfolder-team');

        assert.ok((await diskusage.getByUsername(alice.username)).used < homeUsedBefore);
        assert.ok((await diskusage.getByUsername('groupfolder-team')).used > 0);
    });

    it('end-to-end: groupfolder to home updates all metadata', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', '', [ alice.username ]);
        await addUserFile('groupfolder-team', '/back.txt', 'back');

        const shareId = await shares.create({
            ownerGroupfolder: 'team',
            filePath: '/back.txt',
            receiverUsername: user.username
        });
        const favoriteId = await favorites.create(alice.username, { owner: 'groupfolder-team', filePath: '/back.txt' });
        await recent.add(alice.username, '/groupfolders/team/back.txt');

        await diskusage.getByUsernameAndDirectory('groupfolder-team', '/');
        await diskusage.getByUsernameAndDirectory(alice.username, '/');
        const groupUsedBefore = (await diskusage.getByUsername('groupfolder-team')).used;

        await relocate.relocate({
            fromOwner: 'groupfolder-team',
            fromPath: '/back.txt',
            toOwner: alice.username,
            toPath: '/back.txt'
        });

        const share = await shares.get(shareId);
        assert.equal(share.filePath, '/back.txt');
        assert.equal(share.ownerUsername, alice.username);
        assert.equal(share.ownerGroupfolder, null);

        const favorite = await favorites.get(favoriteId);
        assert.equal(favorite.filePath, '/back.txt');
        assert.equal(favorite.owner, alice.username);

        const recents = await recent.list(alice.username, 10, 10);
        assert.equal(recents.length, 1);
        assert.equal(recents[0].filePath, '/back.txt');
        assert.equal(recents[0].owner, alice.username);

        assert.ok((await diskusage.getByUsername('groupfolder-team')).used < groupUsedBefore);
        assert.ok((await diskusage.getByUsername(alice.username)).used > 0);
    });
});
