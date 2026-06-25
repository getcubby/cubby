import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import favorites from '../favorites.js';
import MainError from '../mainerror.js';
import safe from '@cloudron/safetydance';
import users from '../users.js';

describe('favorites', function () {
    const { databaseSetup, cleanup, admin, user, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    async function createUsersWithFile() {
        await users.add(admin);
        await users.add(user);
        await addUserFile(admin.username, '/favorite.txt', 'favorite content');
    }

    it('can create, get, list, and remove a favorite', async function () {
        await createUsersWithFile();

        const id = await favorites.create(user.username, admin.username, '/favorite.txt');
        assert.ok(id.startsWith('fid-'));

        const favorite = await favorites.get(id);
        assert.equal(favorite.username, user.username);
        assert.equal(favorite.filePath, '/favorite.txt');

        const listed = await favorites.list(user.username);
        assert.equal(listed.length, 1);
        assert.equal(listed[0].id, id);

        const byOwner = await favorites.listByOwnerAndFilePath(admin.username, '/favorite.txt');
        assert.equal(byOwner.length, 1);

        await favorites.remove(id);
        assert.equal(await favorites.get(id), null);
    });

    it('is idempotent when creating the same favorite twice', async function () {
        await createUsersWithFile();

        const firstId = await favorites.create(user.username, admin.username, '/favorite.txt');
        const secondId = await favorites.create(user.username, admin.username, '/favorite.txt');

        assert.equal(firstId, secondId);
        assert.equal((await favorites.list(user.username)).length, 1);
    });

    it('rejects path traversal', async function () {
        await users.add(admin);
        await users.add(user);

        const [error] = await safe(favorites.create(user.username, admin.username, '/../escape.txt'));
        assert.ok(error);
        assert.equal(error.reason, MainError.INVALID_PATH);
    });
});
