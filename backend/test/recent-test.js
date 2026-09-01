import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import recent from '../recent.js';
import files from '../files.js';
import groupfolders from '../groupfolders.js';
import shares from '../shares.js';
import users from '../users.js';

describe('recent', function () {
    const { databaseSetup, cleanup, alice, user, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    it('can add, dedupe, and remove recent entries', async function () {
        await users.add(alice);
        await addUserFile(alice.username, '/recent.txt', 'recent');
        await addUserFile(alice.username, '/other.txt', 'other');

        await recent.add(alice.username, '/home/recent.txt');
        await recent.add(alice.username, '/home/other.txt');
        await recent.add(alice.username, '/home/recent.txt');

        const entries = await recent.list(alice.username, 10, 10);
        assert.equal(entries.length, 2);
        assert.equal(entries[0].filePath, '/recent.txt');

        await recent.remove(alice.username, '/home/recent.txt');
        assert.equal((await recent.list(alice.username, 10, 10)).length, 1);
    });

    it('can add a share-scoped recent entry with a relative path', async function () {
        await users.add(alice);
        await users.add(user);
        await files.addDirectory(alice.username, '/shared-dir');
        await addUserFile(alice.username, '/shared-dir/nested.txt', 'nested');

        const shareId = await shares.create({
            ownerUsername: alice.username,
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
        await users.add(alice);

        const entries = await recent.list(alice.username, 10, 10);
        assert.equal(entries.length, 0);
    });

    it('returns rows for missing files', async function () {
        await users.add(alice);

        await recent.add(alice.username, '/home/missing.txt');

        const entries = await recent.list(alice.username, 10, 10);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].filePath, '/missing.txt');
    });

    it('relocatePaths updates an exact home file path', async function () {
        await users.add(alice);
        await addUserFile(alice.username, '/recent-move.txt', 'recent');

        await recent.add(alice.username, '/home/recent-move.txt');
        await files.move(alice.username, '/recent-move.txt', alice.username, '/recent-renamed.txt');

        await recent.relocatePaths({
            fromOwner: alice.username,
            fromPath: '/recent-move.txt',
            toOwner: alice.username,
            toPath: '/recent-renamed.txt',
            isDirectory: false
        });

        const entries = await recent.list(alice.username, 10, 10);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].filePath, '/recent-renamed.txt');
    });

    it('relocatePaths updates folder entries and descendants', async function () {
        await users.add(alice);
        await files.addDirectory(alice.username, '/recent-dir');
        await addUserFile(alice.username, '/recent-dir/nested.txt', 'nested');

        await recent.add(alice.username, '/home/recent-dir/nested.txt');
        await files.move(alice.username, '/recent-dir', alice.username, '/moved-dir');

        await recent.relocatePaths({
            fromOwner: alice.username,
            fromPath: '/recent-dir',
            toOwner: alice.username,
            toPath: '/moved-dir',
            isDirectory: true
        });

        const entries = await recent.list(alice.username, 10, 10);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].filePath, '/moved-dir/nested.txt');
    });

    it('relocatePaths does not match similar path prefixes', async function () {
        await users.add(alice);
        await files.addDirectory(alice.username, '/recent-dir');
        await addUserFile(alice.username, '/recent-dir/nested.txt', 'nested');
        await addUserFile(alice.username, '/recent-dir-extra.txt', 'extra');

        await recent.add(alice.username, '/home/recent-dir/nested.txt');
        await recent.add(alice.username, '/home/recent-dir-extra.txt');
        await files.move(alice.username, '/recent-dir', alice.username, '/moved-dir');

        await recent.relocatePaths({
            fromOwner: alice.username,
            fromPath: '/recent-dir',
            toOwner: alice.username,
            toPath: '/moved-dir',
            isDirectory: true
        });

        const entries = await recent.list(alice.username, 10, 10);
        assert.equal(entries.length, 2);
        assert.equal(entries.some(e => e.filePath === '/moved-dir/nested.txt'), true);
        assert.equal(entries.some(e => e.filePath === '/recent-dir-extra.txt'), true);
    });

    it('relocatePaths updates owner on cross-root move', async function () {
        await users.add(alice);
        await groupfolders.add('team', 'Team', alice.username);
        await addUserFile(alice.username, '/cross.txt', 'cross');

        await recent.add(alice.username, '/home/cross.txt');

        await recent.relocatePaths({
            fromOwner: alice.username,
            fromPath: '/cross.txt',
            toOwner: 'groupfolder-team',
            toPath: '/cross.txt',
            isDirectory: false
        });

        const entries = await recent.list(alice.username, 10, 10);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].filePath, '/cross.txt');
        assert.equal(entries[0].owner, 'groupfolder-team');
    });

    it('relocatePaths updates share-scoped recent relative paths', async function () {
        await users.add(alice);
        await users.add(user);
        await files.addDirectory(alice.username, '/shared-dir');
        await addUserFile(alice.username, '/shared-dir/nested.txt', 'nested');

        const shareId = await shares.create({
            ownerUsername: alice.username,
            filePath: '/shared-dir',
            receiverUsername: user.username
        });

        await recent.add(user.username, `/shares/${shareId}/nested.txt`);

        await recent.relocatePaths({
            fromOwner: alice.username,
            fromPath: '/shared-dir/nested.txt',
            toOwner: alice.username,
            toPath: '/shared-dir/renamed.txt',
            isDirectory: false
        });

        const entries = await recent.list(user.username, 10, 10);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].shareId, shareId);
        assert.equal(entries[0].filePath, '/renamed.txt');
    });
});
