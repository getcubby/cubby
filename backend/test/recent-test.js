import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import recent from '../recent.js';
import files from '../files.js';
import groupfolders from '../groupfolders.js';
import users from '../users.js';

describe('recent', function () {
    const { databaseSetup, cleanup, admin, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    it('can add, dedupe, and remove recent entries', async function () {
        await users.add(admin);
        await addUserFile(admin.username, '/recent.txt', 'recent');
        await addUserFile(admin.username, '/other.txt', 'other');

        await recent.add(admin.username, '/home/recent.txt');
        await recent.add(admin.username, '/home/other.txt');
        await recent.add(admin.username, '/home/recent.txt');

        const entries = await recent.get(admin.username, 10, 10);
        assert.equal(entries.length, 2);
        assert.equal(entries[0].fileName, 'recent.txt');

        await recent.remove(admin.username, '/home/recent.txt');
        assert.equal((await recent.get(admin.username, 10, 10)).length, 1);
    });

    it('returns empty list for user with no recents', async function () {
        await users.add(admin);

        const entries = await recent.get(admin.username, 10, 10);
        assert.equal(entries.length, 0);
    });

    it('drops stale entries that no longer resolve', async function () {
        await users.add(admin);

        await recent.add(admin.username, '/home/missing.txt');

        const entries = await recent.get(admin.username, 10, 10);
        assert.equal(entries.length, 0);
    });

    it('relocateResourcePaths updates an exact home file path', async function () {
        await users.add(admin);
        await addUserFile(admin.username, '/recent-move.txt', 'recent');

        await recent.add(admin.username, '/home/recent-move.txt');
        await files.move(admin.username, '/recent-move.txt', admin.username, '/recent-renamed.txt');

        await recent.relocateResourcePaths({
            fromResourcePrefix: '/home/recent-move.txt',
            toResourcePrefix: '/home/recent-renamed.txt',
            isDirectory: false
        });

        const entries = await recent.get(admin.username, 10, 10);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].fileName, 'recent-renamed.txt');
    });

    it('relocateResourcePaths updates folder entries and descendants', async function () {
        await users.add(admin);
        await files.addDirectory(admin.username, '/recent-dir');
        await addUserFile(admin.username, '/recent-dir/nested.txt', 'nested');

        await recent.add(admin.username, '/home/recent-dir/nested.txt');
        await files.move(admin.username, '/recent-dir', admin.username, '/moved-dir');

        await recent.relocateResourcePaths({
            fromResourcePrefix: '/home/recent-dir',
            toResourcePrefix: '/home/moved-dir',
            isDirectory: true
        });

        const entries = await recent.get(admin.username, 10, 10);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].fileName, 'nested.txt');
    });

    it('relocateResourcePaths does not match similar path prefixes', async function () {
        await users.add(admin);
        await files.addDirectory(admin.username, '/recent-dir');
        await addUserFile(admin.username, '/recent-dir/nested.txt', 'nested');
        await addUserFile(admin.username, '/recent-dir-extra.txt', 'extra');

        await recent.add(admin.username, '/home/recent-dir/nested.txt');
        await recent.add(admin.username, '/home/recent-dir-extra.txt');
        await files.move(admin.username, '/recent-dir', admin.username, '/moved-dir');

        await recent.relocateResourcePaths({
            fromResourcePrefix: '/home/recent-dir',
            toResourcePrefix: '/home/moved-dir',
            isDirectory: true
        });

        const entries = await recent.get(admin.username, 10, 10);
        assert.equal(entries.length, 2);
        assert.equal(entries.some(e => e.fileName === 'nested.txt'), true);
        assert.equal(entries.some(e => e.fileName === 'recent-dir-extra.txt'), true);
    });

    it('relocateResourcePaths rewrites cross-root prefixes', async function () {
        await users.add(admin);
        await groupfolders.add('team', 'Team', '', [ admin.username ]);
        await addUserFile('groupfolder-team', '/cross.txt', 'cross');

        await recent.add(admin.username, '/home/cross.txt');

        await recent.relocateResourcePaths({
            fromResourcePrefix: '/home/cross.txt',
            toResourcePrefix: '/groupfolders/team/cross.txt',
            isDirectory: false
        });

        const entries = await recent.get(admin.username, 10, 10);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].fileName, 'cross.txt');
    });
});
