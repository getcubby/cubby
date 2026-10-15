import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import files from '../files.js';
import groupfolders from '../groupfolders.js';
import groups from '../groups.js';
import MainError from '../mainerror.js';
import safe from '@cloudron/safetydance';
import shares from '../shares.js';
import users from '../users.js';

describe('shares', function () {
    const { databaseSetup, cleanup, alice, user, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    async function createUsersWithFile() {
        await users.add(alice);
        await users.add(user);
        await addUserFile(alice.username, '/shared.txt', 'shared content');
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
            ownerUserId: alice.id,
            filePath: '/shared.txt',
            receiverUserId: user.id,
            readonly: true
        });

        const share = await shares.get(shareId);
        assert.ok(share);
        assert.equal(share.ownerUsername, alice.username);
        assert.equal(share.filePath, '/shared.txt');
        assert.equal(share.receiverUsername, user.username);
        assert.equal(share.readonly, true);
    });

    it('can create a public link share', async function () {
        await createUsersWithFile();

        const shareId = await shares.create({
            ownerUserId: alice.id,
            filePath: '/shared.txt',
            readonly: false
        });

        const share = await shares.get(shareId);
        assert.equal(share.receiverUsername, null);
        assert.equal(share.receiverEmail, null);
    });

    it('rejects path traversal', async function () {
        await users.add(alice);

        const [error] = await safe(shares.create({
            ownerUserId: alice.id,
            filePath: '/../escape.txt',
            receiverEmail: 'guest@test.local'
        }));
        assert.ok(error);
        assert.equal(error.reason, MainError.INVALID_PATH);
    });

    it('can list owned shares and shares shared with a user', async function () {
        await createUsersWithFile();

        await shares.create({
            ownerUserId: alice.id,
            filePath: '/shared.txt',
            receiverUserId: user.id
        });

        const owned = await shares.list(alice.id);
        assert.equal(owned.length, 1);

        const sharedWith = await shares.listSharedWith(user.id);
        assert.equal(sharedWith.length, 1);
        assert.equal(sharedWith[0].ownerUsername, alice.username);
    });

    it('excludes expired shares from listSharedWith', async function () {
        await createUsersWithFile();

        await shares.create({
            ownerUserId: alice.id,
            filePath: '/shared.txt',
            receiverUserId: user.id,
            expiresAt: Date.now() - 1000
        });

        assert.equal((await shares.listSharedWith(user.id)).length, 0);
    });

    it('can find shares by owner and filepath', async function () {
        await createUsersWithFile();

        const shareId = await shares.create({
            ownerUserId: alice.id,
            filePath: '/shared.txt',
            receiverEmail: 'guest@test.local'
        });

        const result = await shares.getByOwnerAndFilepath(alice.id, null, '/shared.txt');
        assert.equal(result.length, 1);
        assert.equal(result[0].id, shareId);
    });

    it('can find shares by owner, receiver, and filepath', async function () {
        await createUsersWithFile();

        await shares.create({
            ownerUserId: alice.id,
            filePath: '/docs/report.txt',
            receiverUserId: user.id
        });
        await addUserFile(alice.username, '/docs/report.txt', 'report');

        const exact = await shares.getByOwnerAndReceiverAndFilepath(alice.id, null, user.id, '/docs/report.txt', true);
        assert.equal(exact.length, 1);

        const prefix = await shares.getByOwnerAndReceiverAndFilepath(alice.id, null, user.id, '/docs', false);
        assert.equal(prefix.length, 1);
    });

    it('can create a groupfolder share', async function () {
        await users.add(alice);
        await groupfolders.add('team', 'Team', alice.id);
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
            ownerUserId: alice.id,
            filePath: '/shared.txt',
            receiverUserId: user.id
        });

        await shares.remove(shareId);
        assert.equal(await shares.get(shareId), null);
    });

    it('can create and list a group share', async function () {
        await createUsersWithFile();
        await groups.upsertFromScim('gid-1', 'Engineering', [ user.id ]);

        const shareId = await shares.create({
            ownerUserId: alice.id,
            filePath: '/shared.txt',
            receiverGroup: 'gid-1'
        });

        const share = await shares.get(shareId);
        assert.equal(share.receiverGroup, 'gid-1');
        assert.equal(share.receiverGroupName, 'Engineering');

        await groups.setActive('gid-1', false);
        assert.equal((await shares.get(shareId)).receiverGroupName, 'Engineering');

        // members of the group can see the share
        const sharedWith = await shares.listSharedWith(user.id);
        assert.equal(sharedWith.length, 1);
        assert.equal(sharedWith[0].id, shareId);

        // non-members cannot
        assert.equal((await shares.listSharedWith('intruder')).length, 0);

        assert.equal(await shares.isReceiverAllowed(share, user.id), true);
        assert.equal(await shares.isReceiverAllowed(share, 'intruder'), false);
    });

    it('removes group shares when the group is deleted', async function () {
        await createUsersWithFile();
        await groups.upsertFromScim('gid-1', 'Engineering', [ user.id ]);

        const shareId = await shares.create({
            ownerUserId: alice.id,
            filePath: '/shared.txt',
            receiverGroup: 'gid-1'
        });

        await groups.remove('gid-1');

        assert.equal(await shares.get(shareId), null);
    });

    it('relocatePaths updates an exact file share path', async function () {
        await createUsersWithFile();

        const shareId = await shares.create({
            ownerUserId: alice.id,
            filePath: '/shared.txt',
            receiverUserId: user.id
        });

        await shares.relocatePaths({
            fromOwner: alice.id,
            fromPath: '/shared.txt',
            toOwner: alice.id,
            toPath: '/renamed.txt',
            isDirectory: false
        });

        const share = await shares.get(shareId);
        assert.equal(share.filePath, '/renamed.txt');
    });

    it('relocatePaths updates folder shares and descendants', async function () {
        await createUsersWithFile();
        await files.addDirectory(alice.id, '/shared-dir');
        await addUserFile(alice.username, '/shared-dir/nested.txt', 'nested');

        const folderShareId = await shares.create({
            ownerUserId: alice.id,
            filePath: '/shared-dir',
            receiverUserId: user.id
        });
        const nestedShareId = await shares.create({
            ownerUserId: alice.id,
            filePath: '/shared-dir/nested.txt',
            receiverEmail: 'guest@test.local'
        });

        await shares.relocatePaths({
            fromOwner: alice.id,
            fromPath: '/shared-dir',
            toOwner: alice.id,
            toPath: '/moved-dir',
            isDirectory: true
        });

        assert.equal((await shares.get(folderShareId)).filePath, '/moved-dir');
        assert.equal((await shares.get(nestedShareId)).filePath, '/moved-dir/nested.txt');
    });

    it('relocatePaths updates owner columns on cross-root move', async function () {
        await users.add(alice);
        await users.add(user);
        await groupfolders.add('team', 'Team', user.id);
        await addUserFile(alice.username, '/cross.txt', 'cross');

        const shareId = await shares.create({
            ownerUserId: alice.id,
            filePath: '/cross.txt',
            receiverUserId: user.id
        });

        await shares.relocatePaths({
            fromOwner: alice.id,
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
