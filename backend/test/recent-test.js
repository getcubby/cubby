import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import recent from '../recent.js';
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
});
