import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import recent from '../recent.js';
import files from '../files.js';
import groupfolders from '../groupfolders.js';
import shares from '../shares.js';
import users from '../users.js';

describe('recent', function () {
    const { databaseSetup, cleanup, admin, user, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    it('can add, dedupe, and remove recent entries', async function () {
        await users.add(admin);
        await addUserFile(admin.username, '/recent.txt', 'recent');
        await addUserFile(admin.username, '/other.txt', 'other');

        await recent.add(admin.username, '/home/recent.txt');
        await recent.add(admin.username, '/home/other.txt');
        await recent.add(admin.username, '/home/recent.txt');

        const entries = await recent.list(admin.username, 10, 10);
        assert.equal(entries.length, 2);
        assert.equal(entries[0].filePath, '/recent.txt');

        await recent.remove(admin.username, '/home/recent.txt');
        assert.equal((await recent.list(admin.username, 10, 10)).length, 1);
    });

    it('can add a share-scoped recent entry with a relative path', async function () {
        await users.add(admin);
        await users.add(user);
        await files.addDirectory(admin.username, '/shared-dir');
        await addUserFile(admin.username, '/shared-dir/nested.txt', 'nested');

        const shareId = await shares.create({
            ownerUsername: admin.username,
            filePath: '/shared-dir',
            receiverUsername: user.username
        });

        await recent.add(user.username, `/shares/${shareId}/nested.txt`);

        const entries = await recent.list(user.username, 10, 10);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].shareId, shareId);
        assert.equal(entries[0].filePath, '/nested.txt');
        assert.equal(entries[0].owner, null);
    });

    it('returns empty list for user with no recents', async function () {
        await users.add(admin);

        const entries = await recent.list(admin.username, 10, 10);
        assert.equal(entries.length, 0);
    });

    it('returns rows for missing files', async function () {
        await users.add(admin);

        await recent.add(admin.username, '/home/missing.txt');

        const entries = await recent.list(admin.username, 10, 10);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].filePath, '/missing.txt');
    });

    it('relocatePaths updates an exact home file path', async function () {
        await users.add(admin);
        await addUserFile(admin.username, '/recent-move.txt', 'recent');

        await recent.add(admin.username, '/home/recent-move.txt');
        await files.move(admin.username, '/recent-move.txt', admin.username, '/recent-renamed.txt');

        await recent.relocatePaths({
            fromOwner: admin.username,
            fromPath: '/recent-move.txt',
            toOwner: admin.username,
            toPath: '/recent-renamed.txt',
            isDirectory: false
        });

        const entries = await recent.list(admin.username, 10, 10);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].filePath, '/recent-renamed.txt');
    });

    it('relocatePaths updates folder entries and descendants', async function () {
        await users.add(admin);
        await files.addDirectory(admin.username, '/recent-dir');
        await addUserFile(admin.username, '/recent-dir/nested.txt', 'nested');

        await recent.add(admin.username, '/home/recent-dir/nested.txt');
        await files.move(admin.username, '/recent-dir', admin.username, '/moved-dir');

        await recent.relocatePaths({
            fromOwner: admin.username,
            fromPath: '/recent-dir',
            toOwner: admin.username,
            toPath: '/moved-dir',
            isDirectory: true
        });

        const entries = await recent.list(admin.username, 10, 10);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].filePath, '/moved-dir/nested.txt');
    });

    it('relocatePaths does not match similar path prefixes', async function () {
        await users.add(admin);
        await files.addDirectory(admin.username, '/recent-dir');
        await addUserFile(admin.username, '/recent-dir/nested.txt', 'nested');
        await addUserFile(admin.username, '/recent-dir-extra.txt', 'extra');

        await recent.add(admin.username, '/home/recent-dir/nested.txt');
        await recent.add(admin.username, '/home/recent-dir-extra.txt');
        await files.move(admin.username, '/recent-dir', admin.username, '/moved-dir');

        await recent.relocatePaths({
            fromOwner: admin.username,
            fromPath: '/recent-dir',
            toOwner: admin.username,
            toPath: '/moved-dir',
            isDirectory: true
        });

        const entries = await recent.list(admin.username, 10, 10);
        assert.equal(entries.length, 2);
        assert.equal(entries.some(e => e.filePath === '/moved-dir/nested.txt'), true);
        assert.equal(entries.some(e => e.filePath === '/recent-dir-extra.txt'), true);
    });

    it('relocatePaths updates owner on cross-root move', async function () {
        await users.add(admin);
        await groupfolders.add('team', 'Team', '', [ admin.username ]);
        await addUserFile(admin.username, '/cross.txt', 'cross');

        await recent.add(admin.username, '/home/cross.txt');

        await recent.relocatePaths({
            fromOwner: admin.username,
            fromPath: '/cross.txt',
            toOwner: 'groupfolder-team',
            toPath: '/cross.txt',
            isDirectory: false
        });

        const entries = await recent.list(admin.username, 10, 10);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].filePath, '/cross.txt');
        assert.equal(entries[0].owner, 'groupfolder-team');
    });

    it('relocatePaths updates share-scoped recent relative paths', async function () {
        await users.add(admin);
        await users.add(user);
        await files.addDirectory(admin.username, '/shared-dir');
        await addUserFile(admin.username, '/shared-dir/nested.txt', 'nested');

        const shareId = await shares.create({
            ownerUsername: admin.username,
            filePath: '/shared-dir',
            receiverUsername: user.username
        });

        await recent.add(user.username, `/shares/${shareId}/nested.txt`);

        await recent.relocatePaths({
            fromOwner: admin.username,
            fromPath: '/shared-dir/nested.txt',
            toOwner: admin.username,
            toPath: '/shared-dir/renamed.txt',
            isDirectory: false
        });

        const entries = await recent.list(user.username, 10, 10);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].shareId, shareId);
        assert.equal(entries[0].filePath, '/renamed.txt');
    });
});
