import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import files from '../files.js';
import groupfolders from '../groupfolders.js';
import MainError from '../mainerror.js';
import safe from '@cloudron/safetydance';
import shares from '../shares.js';
import users from '../users.js';

describe('shares', function () {
    const { databaseSetup, cleanup, admin, user, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    async function createUsersWithFile() {
        await users.add(admin);
        await users.add(user);
        await addUserFile(admin.username, '/shared.txt', 'shared content');
    }

    it('detects expired shares', function () {
        assert.equal(shares.isExpired({ expiresAt: new Date(Date.now() - 1000) }), true);
        assert.equal(shares.isExpired({ expiresAt: new Date(Date.now() + 60_000) }), false);
        assert.equal(shares.isExpired({ expiresAt: null }), false);
        assert.equal(shares.isExpired(null), false);
    });

    it('can create and get a user share', async function () {
        await createUsersWithFile();

        const shareId = await shares.create({
            ownerUsername: admin.username,
            filePath: '/shared.txt',
            receiverUsername: user.username,
            readonly: true
        });

        const share = await shares.get(shareId);
        assert.ok(share);
        assert.equal(share.ownerUsername, admin.username);
        assert.equal(share.filePath, '/shared.txt');
        assert.equal(share.receiverUsername, user.username);
        assert.equal(share.readonly, true);
    });

    it('can create a public link share', async function () {
        await createUsersWithFile();

        const shareId = await shares.create({
            ownerUsername: admin.username,
            filePath: '/shared.txt',
            readonly: false
        });

        const share = await shares.get(shareId);
        assert.equal(share.receiverUsername, null);
        assert.equal(share.receiverEmail, null);
    });

    it('rejects path traversal', async function () {
        await users.add(admin);

        const [error] = await safe(shares.create({
            ownerUsername: admin.username,
            filePath: '/../escape.txt',
            receiverEmail: 'guest@test.local'
        }));
        assert.ok(error);
        assert.equal(error.reason, MainError.INVALID_PATH);
    });

    it('can list owned shares and shares shared with a user', async function () {
        await createUsersWithFile();

        await shares.create({
            ownerUsername: admin.username,
            filePath: '/shared.txt',
            receiverUsername: user.username
        });

        const owned = await shares.list(admin.username);
        assert.equal(owned.length, 1);

        const sharedWith = await shares.listSharedWith(user.username);
        assert.equal(sharedWith.length, 1);
        assert.equal(sharedWith[0].ownerUsername, admin.username);
    });

    it('excludes expired shares from listSharedWith', async function () {
        await createUsersWithFile();

        await shares.create({
            ownerUsername: admin.username,
            filePath: '/shared.txt',
            receiverUsername: user.username,
            expiresAt: Date.now() - 1000
        });

        assert.equal((await shares.listSharedWith(user.username)).length, 0);
    });

    it('can find shares by owner and filepath', async function () {
        await createUsersWithFile();

        const shareId = await shares.create({
            ownerUsername: admin.username,
            filePath: '/shared.txt',
            receiverEmail: 'guest@test.local'
        });

        const result = await shares.getByOwnerAndFilepath(admin.username, null, '/shared.txt');
        assert.equal(result.length, 1);
        assert.equal(result[0].id, shareId);
    });

    it('can find shares by owner, receiver, and filepath', async function () {
        await createUsersWithFile();

        await shares.create({
            ownerUsername: admin.username,
            filePath: '/docs/report.txt',
            receiverUsername: user.username
        });
        await addUserFile(admin.username, '/docs/report.txt', 'report');

        const exact = await shares.getByOwnerAndReceiverAndFilepath(admin.username, null, user.username, '/docs/report.txt', true);
        assert.equal(exact.length, 1);

        const prefix = await shares.getByOwnerAndReceiverAndFilepath(admin.username, null, user.username, '/docs', false);
        assert.equal(prefix.length, 1);
    });

    it('can create a groupfolder share', async function () {
        await users.add(admin);
        await groupfolders.add('team', 'Team', '', [ admin.username ]);
        await files.addOrOverwriteFileContents('groupfolder-team', '/team.txt', Buffer.from('team file'), null, true);

        const shareId = await shares.create({
            ownerGroupfolder: 'team',
            filePath: '/team.txt',
            receiverEmail: 'guest@test.local'
        });

        const share = await shares.get(shareId);
        assert.equal(share.ownerGroupfolder, 'team');
        assert.equal(share.ownerUsername, null);
    });

    it('can remove a share', async function () {
        await createUsersWithFile();

        const shareId = await shares.create({
            ownerUsername: admin.username,
            filePath: '/shared.txt',
            receiverUsername: user.username
        });

        await shares.remove(shareId);
        assert.equal(await shares.get(shareId), null);
    });

    it('relocatePaths updates an exact file share path', async function () {
        await createUsersWithFile();

        const shareId = await shares.create({
            ownerUsername: admin.username,
            filePath: '/shared.txt',
            receiverUsername: user.username
        });

        await shares.relocatePaths({
            fromOwner: admin.username,
            fromPath: '/shared.txt',
            toOwner: admin.username,
            toPath: '/renamed.txt',
            isDirectory: false
        });

        const share = await shares.get(shareId);
        assert.equal(share.filePath, '/renamed.txt');
    });

    it('relocatePaths updates folder shares and descendants', async function () {
        await createUsersWithFile();
        await files.addDirectory(admin.username, '/shared-dir');
        await addUserFile(admin.username, '/shared-dir/nested.txt', 'nested');

        const folderShareId = await shares.create({
            ownerUsername: admin.username,
            filePath: '/shared-dir',
            receiverUsername: user.username
        });
        const nestedShareId = await shares.create({
            ownerUsername: admin.username,
            filePath: '/shared-dir/nested.txt',
            receiverEmail: 'guest@test.local'
        });

        await shares.relocatePaths({
            fromOwner: admin.username,
            fromPath: '/shared-dir',
            toOwner: admin.username,
            toPath: '/moved-dir',
            isDirectory: true
        });

        assert.equal((await shares.get(folderShareId)).filePath, '/moved-dir');
        assert.equal((await shares.get(nestedShareId)).filePath, '/moved-dir/nested.txt');
    });

    it('relocatePaths updates owner columns on cross-root move', async function () {
        await users.add(admin);
        await users.add(user);
        await groupfolders.add('team', 'Team', '', [ user.username ]);
        await addUserFile(admin.username, '/cross.txt', 'cross');

        const shareId = await shares.create({
            ownerUsername: admin.username,
            filePath: '/cross.txt',
            receiverUsername: user.username
        });

        await shares.relocatePaths({
            fromOwner: admin.username,
            fromPath: '/cross.txt',
            toOwner: 'groupfolder-team',
            toPath: '/cross.txt',
            isDirectory: false
        });

        const share = await shares.get(shareId);
        assert.equal(share.filePath, '/cross.txt');
        assert.equal(share.ownerUsername, null);
        assert.equal(share.ownerGroupfolder, 'team');
    });
});
