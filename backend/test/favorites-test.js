import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import favorites from '../favorites.js';
import files from '../files.js';
import groupfolders from '../groupfolders.js';
import shares from '../shares.js';
import MainError from '../mainerror.js';
import safe from '@cloudron/safetydance';
import users from '../users.js';

describe('favorites', function () {
    const { databaseSetup, cleanup, alice, user, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    async function createUsersWithFile() {
        await users.add(alice);
        await users.add(user);
        await addUserFile(alice.username, '/favorite.txt', 'favorite content');
    }

    it('can create, get, list, and remove a favorite', async function () {
        await createUsersWithFile();

        const id = await favorites.create(user.username, { owner: alice.username, filePath: '/favorite.txt' });
        assert.match(id, /^[0-9a-f-]{36}$/);

        const favorite = await favorites.get(id);
        assert.equal(favorite.username, user.username);
        assert.equal(favorite.filePath, '/favorite.txt');
        assert.equal(favorite.shareId, null);

        const listed = await favorites.list(user.username);
        assert.equal(listed.length, 1);
        assert.equal(listed[0].id, id);

        const byOwner = await favorites.listByOwnerAndFilePath(alice.username, '/favorite.txt');
        assert.equal(byOwner.length, 1);

        await favorites.remove(id);
        assert.equal(await favorites.get(id), null);
    });

    it('is idempotent when creating the same favorite twice', async function () {
        await createUsersWithFile();

        const firstId = await favorites.create(user.username, { owner: alice.username, filePath: '/favorite.txt' });
        const secondId = await favorites.create(user.username, { owner: alice.username, filePath: '/favorite.txt' });

        assert.equal(firstId, secondId);
        assert.equal((await favorites.list(user.username)).length, 1);
    });

    it('can create a share-scoped favorite with a relative path', async function () {
        await createUsersWithFile();
        await files.addDirectory(alice.username, '/shared-dir');
        await addUserFile(alice.username, '/shared-dir/nested.txt', 'nested');

        const shareId = await shares.create({
            ownerUsername: alice.username,
            filePath: '/shared-dir',
            receiverUsername: user.username
        });

        const id = await favorites.create(user.username, { shareId, filePath: '/nested.txt' });
        const favorite = await favorites.get(id);
        assert.equal(favorite.shareId, shareId);
        assert.equal(favorite.filePath, '/nested.txt');
        assert.equal(favorite.owner, null);

        const byShare = await favorites.listByShareAndFilePath(shareId, '/nested.txt');
        assert.equal(byShare.length, 1);
        assert.equal(byShare[0].username, user.username);

        const byOwner = await favorites.listByOwnerAndFilePath(alice.username, '/shared-dir/nested.txt');
        assert.equal(byOwner.length, 0);
    });

    it('rejects path traversal', async function () {
        await users.add(alice);
        await users.add(user);

        const [error] = await safe(favorites.create(user.username, { owner: alice.username, filePath: '/../escape.txt' }));
        assert.ok(error);
        assert.equal(error.reason, MainError.INVALID_PATH);
    });

    it('relocatePaths updates an exact file favorite path and keeps id', async function () {
        await createUsersWithFile();

        const id = await favorites.create(user.username, { owner: alice.username, filePath: '/favorite.txt' });

        await favorites.relocatePaths({
            fromOwner: alice.username,
            fromPath: '/favorite.txt',
            toOwner: alice.username,
            toPath: '/renamed.txt',
            isDirectory: false
        });

        const favorite = await favorites.get(id);
        assert.equal(favorite.filePath, '/renamed.txt');
        assert.equal(favorite.owner, alice.username);

        const listed = await favorites.list(user.username);
        assert.equal(listed.length, 1);
        assert.equal(listed[0].id, id);
    });

    it('relocatePaths updates folder favorites and descendants', async function () {
        await createUsersWithFile();
        await files.addDirectory(alice.username, '/starred-dir');
        await addUserFile(alice.username, '/starred-dir/nested.txt', 'nested');

        await favorites.create(user.username, { owner: alice.username, filePath: '/starred-dir' });
        await favorites.create(alice.username, { owner: alice.username, filePath: '/starred-dir/nested.txt' });

        await favorites.relocatePaths({
            fromOwner: alice.username,
            fromPath: '/starred-dir',
            toOwner: alice.username,
            toPath: '/moved-dir',
            isDirectory: true
        });

        const userFavorites = await favorites.list(user.username);
        assert.equal(userFavorites.length, 1);
        assert.equal(userFavorites[0].filePath, '/moved-dir');

        const byPath = await favorites.listByOwnerAndFilePath(alice.username, '/moved-dir/nested.txt');
        assert.equal(byPath.length, 1);
    });

    it('relocatePaths updates share-scoped favorite relative paths', async function () {
        await createUsersWithFile();
        await files.addDirectory(alice.username, '/shared-dir');
        await addUserFile(alice.username, '/shared-dir/nested.txt', 'nested');

        const shareId = await shares.create({
            ownerUsername: alice.username,
            filePath: '/shared-dir',
            receiverUsername: user.username
        });

        const id = await favorites.create(user.username, { shareId, filePath: '/nested.txt' });

        await favorites.relocatePaths({
            fromOwner: alice.username,
            fromPath: '/shared-dir/nested.txt',
            toOwner: alice.username,
            toPath: '/shared-dir/renamed.txt',
            isDirectory: false
        });

        const favorite = await favorites.get(id);
        assert.equal(favorite.filePath, '/renamed.txt');
    });

    it('relocatePaths updates owner on cross-root move', async function () {
        await users.add(alice);
        await users.add(user);
        await groupfolders.add('team', 'Team', user.username);
        await addUserFile(alice.username, '/cross.txt', 'cross');

        await favorites.create(user.username, { owner: alice.username, filePath: '/cross.txt' });

        await favorites.relocatePaths({
            fromOwner: alice.username,
            fromPath: '/cross.txt',
            toOwner: 'groupfolder-team',
            toPath: '/cross.txt',
            isDirectory: false
        });

        const listed = await favorites.list(user.username);
        assert.equal(listed.length, 1);
        assert.equal(listed[0].filePath, '/cross.txt');
        assert.equal(listed[0].owner, 'groupfolder-team');
    });
});
