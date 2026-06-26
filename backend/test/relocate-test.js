import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import files from '../files.js';
import relocate from '../relocate.js';
import groupfolders from '../groupfolders.js';
import shares from '../shares.js';
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

    it('keeps shares working after relocate', async function () {
        await createUsers();
        await addUserFile(admin.username, '/shared-move.txt', 'shared');

        const shareId = await shares.create({
            ownerUsername: admin.username,
            filePath: '/shared-move.txt',
            receiverUsername: user.username
        });

        await relocate.relocate({
            fromOwner: admin.username,
            fromPath: '/shared-move.txt',
            toOwner: admin.username,
            toPath: '/shared-renamed.txt'
        });

        const share = await shares.get(shareId);
        assert.equal(share.filePath, '/shared-renamed.txt');

        const file = await files.get(admin.username, '/shared-renamed.txt');
        assert.equal(file.fileName, 'shared-renamed.txt');
    });
});
