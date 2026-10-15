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
            actor: alice.id,
            fromOwner: alice.id,
            fromPath: '/relocate.txt',
            toOwner: alice.id,
            toPath: '/renamed.txt'
        });

        const [missingError] = await safe(files.get(alice.id, '/relocate.txt'));
        assert.equal(missingError.reason, MainError.NOT_FOUND);

        const file = await files.get(alice.id, '/renamed.txt');
        assert.equal(file.fileName, 'renamed.txt');

        const activityItems = await activity.listByPath(alice.id, '/renamed.txt');
        assert.equal(activityItems.length, 1);
        assert.equal(activityItems[0].action, 'moved');
        assert.equal(activityItems[0].details.toPath, '/renamed.txt');
    });

    it('can move a file across storage roots', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', user.id);
        await addUserFile(alice.username, '/cross-root.txt', 'payload');

        await relocate.relocate({
            fromOwner: alice.id,
            fromPath: '/cross-root.txt',
            toOwner: 'groupfolder-team',
            toPath: '/cross-root.txt'
        });

        const [missingError] = await safe(files.get(alice.id, '/cross-root.txt'));
        assert.equal(missingError.reason, MainError.NOT_FOUND);

        const file = await files.get('groupfolder-team', '/cross-root.txt');
        assert.equal(file.fileName, 'cross-root.txt');
    });

    it('can move a directory tree', async function () {
        await createUsers();
        await files.addDirectory(alice.id, '/tree');
        await addUserFile(alice.username, '/tree/leaf.txt', 'leaf');

        await relocate.relocate({
            fromOwner: alice.id,
            fromPath: '/tree',
            toOwner: alice.id,
            toPath: '/moved-tree'
        });

        const [missingError] = await safe(files.get(alice.id, '/tree/leaf.txt'));
        assert.equal(missingError.reason, MainError.NOT_FOUND);

        const leaf = await files.get(alice.id, '/moved-tree/leaf.txt');
        assert.equal(leaf.fileName, 'leaf.txt');
    });

    it('end-to-end: rename in home updates favorites, recent, and diskusage', async function () {
        await createUsers();
        await files.addDirectory(alice.id, '/docs');
        await addUserFile(alice.username, '/docs/report.txt', 'report-content');

        const favoriteId = await favorites.create(user.id, { owner: alice.id, filePath: '/docs/report.txt' });
        await recent.add(alice.id, '/home/docs/report.txt');

        await diskusage.getByUsernameAndDirectory(alice.id, '/docs');
        const docsSizeBefore = await diskusage.getByUsernameAndDirectory(alice.id, '/docs');

        await relocate.relocate({
            fromOwner: alice.id,
            fromPath: '/docs/report.txt',
            toOwner: alice.id,
            toPath: '/docs/report-renamed.txt'
        });

        const favorite = await favorites.get(favoriteId);
        assert.equal(favorite.filePath, '/docs/report-renamed.txt');

        const recents = await recent.list(alice.id, 10, 10);
        assert.equal(recents.length, 1);
        assert.equal(recents[0].filePath, '/docs/report-renamed.txt');

        assert.equal(await diskusage.getByUsernameAndDirectory(alice.id, '/docs/report.txt'), 0);
        assert.ok(await diskusage.getByUsernameAndDirectory(alice.id, '/docs') >= docsSizeBefore);
    });

    it('end-to-end: folder move updates shares, favorites, recent, and diskusage', async function () {
        await createUsers();
        await files.addDirectory(alice.id, '/parent-a');
        await files.addDirectory(alice.id, '/parent-a/old-dir');
        await files.addDirectory(alice.id, '/parent-b');
        await addUserFile(alice.username, '/parent-a/old-dir/nested.txt', 'nested');

        const shareId = await shares.create({
            ownerUserId: alice.id,
            filePath: '/parent-a/old-dir',
            receiverUserId: user.id
        });
        const favoriteId = await favorites.create(user.id, { owner: alice.id, filePath: '/parent-a/old-dir/nested.txt' });
        await recent.add(alice.id, '/home/parent-a/old-dir/nested.txt');

        await diskusage.getByUsernameAndDirectory(alice.id, '/parent-a/old-dir');
        await diskusage.getByUsernameAndDirectory(alice.id, '/parent-b');

        await relocate.relocate({
            fromOwner: alice.id,
            fromPath: '/parent-a/old-dir',
            toOwner: alice.id,
            toPath: '/parent-b/new-dir'
        });

        assert.equal((await shares.get(shareId)).filePath, '/parent-b/new-dir');

        const movedFavorite = await favorites.get(favoriteId);
        assert.equal(movedFavorite.filePath, '/parent-b/new-dir/nested.txt');

        const recents = await recent.list(alice.id, 10, 10);
        assert.equal(recents.length, 1);
        assert.equal(recents[0].filePath, '/parent-b/new-dir/nested.txt');

        assert.equal(await diskusage.getByUsernameAndDirectory(alice.id, '/parent-a/old-dir'), 0);
        assert.ok(await diskusage.getByUsernameAndDirectory(alice.id, '/parent-b/new-dir') > 0);
    });

    it('end-to-end: home to groupfolder updates all metadata', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', alice.id);
        await addUserFile(alice.username, '/cross.txt', 'cross');

        const shareId = await shares.create({
            ownerUserId: alice.id,
            filePath: '/cross.txt',
            receiverUserId: user.id
        });
        const favoriteId = await favorites.create(user.id, { owner: alice.id, filePath: '/cross.txt' });
        await recent.add(alice.id, '/home/cross.txt');

        await diskusage.getByUsernameAndDirectory(alice.id, '/');
        await diskusage.getByUsernameAndDirectory('groupfolder-team', '/');
        const homeUsedBefore = (await diskusage.getByUsername(alice.id)).used;

        await relocate.relocate({
            fromOwner: alice.id,
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

        const recents = await recent.list(alice.id, 10, 10);
        assert.equal(recents.length, 1);
        assert.equal(recents[0].filePath, '/cross.txt');
        assert.equal(recents[0].owner, 'groupfolder-team');

        assert.ok((await diskusage.getByUsername(alice.id)).used < homeUsedBefore);
        assert.ok((await diskusage.getByUsername('groupfolder-team')).used > 0);
    });

    it('end-to-end: groupfolder to home updates all metadata', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', alice.id);
        await addUserFile('groupfolder-team', '/back.txt', 'back');

        const shareId = await shares.create({
            ownerGroupfolder: 'team',
            filePath: '/back.txt',
            receiverUserId: user.id
        });
        const favoriteId = await favorites.create(alice.id, { owner: 'groupfolder-team', filePath: '/back.txt' });
        await recent.add(alice.id, '/groupfolders/team/back.txt');

        await diskusage.getByUsernameAndDirectory('groupfolder-team', '/');
        await diskusage.getByUsernameAndDirectory(alice.id, '/');
        const groupUsedBefore = (await diskusage.getByUsername('groupfolder-team')).used;

        await relocate.relocate({
            fromOwner: 'groupfolder-team',
            fromPath: '/back.txt',
            toOwner: alice.id,
            toPath: '/back.txt'
        });

        const share = await shares.get(shareId);
        assert.equal(share.filePath, '/back.txt');
        assert.equal(share.ownerUsername, alice.username);
        assert.equal(share.ownerGroupfolder, null);

        const favorite = await favorites.get(favoriteId);
        assert.equal(favorite.filePath, '/back.txt');
        assert.equal(favorite.owner, alice.id);

        const recents = await recent.list(alice.id, 10, 10);
        assert.equal(recents.length, 1);
        assert.equal(recents[0].filePath, '/back.txt');
        assert.equal(recents[0].owner, alice.id);

        assert.ok((await diskusage.getByUsername('groupfolder-team')).used < groupUsedBefore);
        assert.ok((await diskusage.getByUsername(alice.id)).used > 0);
    });
});
