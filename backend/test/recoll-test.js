import { describe, it, before, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import child_process from 'node:child_process';
import common from './common.js';
import paths from '../paths.js';
import fs from 'node:fs';
import groupfolders from '../groupfolders.js';
import path from 'node:path';
import recoll from '../recoll.js';
import users from '../users.js';

function hasCommand(command) {
    try {
        child_process.execSync(`command -v ${command}`, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

const RECOLL_AVAILABLE = hasCommand('recoll') && hasCommand('recollindex');

describe('recoll', function () {
    const { databaseSetup, cleanup, alice, user, addUserFile } = common;

    before(function () {
        if (!RECOLL_AVAILABLE) this.skip();
    });

    beforeEach(databaseSetup);
    after(cleanup);

    function indexDbPath(username) {
        return path.join(paths.SEARCH_INDEX_PATH, username, 'xapiandb');
    }

    async function indexUser(username) {
        await recoll.indexByUsername(username);
        assert.ok(fs.existsSync(indexDbPath(username)), 'recoll index was not created');
    }

    async function createUserWithIndexedFile(username, filePath, content) {
        await users.add({ id: `uid-${username}`, username, email: `${username}@test.local`, displayName: username });
        await addUserFile(username, filePath, content);
        await indexUser(`uid-${username}`);
    }

    it('writes a memory-bounded recoll config', async function () {
        await users.add(alice);

        await recoll.indexByUsername(alice.id);

        const config = fs.readFileSync(path.join(paths.SEARCH_INDEX_PATH, alice.id, 'recoll.conf'), 'utf8');
        assert.ok(config.includes('idxflushmb = 10'));
        assert.ok(config.includes('thrQSizes = -1 -1 -1'));
        assert.ok(config.includes('filtermaxmbytes = 512'));
        assert.ok(config.includes('filtermaxseconds = 300'));
        assert.ok(config.includes('idxloglevel = 2'));
        assert.ok(config.includes('skippedNames+ = ~$* .DS_Store Thumbs.db ._*'));
    });

    it('can index and search user files', async function () {
        const marker = `recoll-user-marker-${Date.now()}`;
        await createUserWithIndexedFile(alice.username, '/search-me.txt', marker);

        const results = await recoll.searchByUsername(alice.id, marker);
        assert.ok(results.length >= 1);
        assert.equal(results[0].fileName, 'search-me.txt');
        assert.ok(results[0].entry.filePath.endsWith('search-me.txt'));
    });

    it('can index and search groupfolder files', async function () {
        const marker = `recoll-group-marker-${Date.now()}`;

        await users.add(alice);
        await users.add(user);
        await groupfolders.add('team', 'Team', user.id);
        await addUserFile('groupfolder-team', '/team-doc.txt', marker);
        await indexUser(user.id);

        const results = await recoll.searchByUsername(user.id, marker);
        assert.ok(results.length >= 1);
        assert.equal(results[0].fileName, 'team-doc.txt');
    });

    it('builds an index on demand when searching', async function () {
        const marker = `recoll-ondemand-marker-${Date.now()}`;

        await users.add(alice);
        await addUserFile(alice.username, '/ondemand.txt', marker);
        assert.equal(fs.existsSync(indexDbPath(alice.id)), false);

        const results = await recoll.searchByUsername(alice.id, marker);
        assert.ok(fs.existsSync(indexDbPath(alice.id)), 'recoll index was not created');
        assert.ok(results.length >= 1);
        assert.equal(results[0].fileName, 'ondemand.txt');
    });

    it('can reindex members via indexByGroupFolder', async function () {
        const marker = `recoll-groupfolder-marker-${Date.now()}`;

        await users.add(user);
        await groupfolders.add('shared', 'Shared', user.id);
        await addUserFile('groupfolder-shared', '/shared-doc.txt', marker);
        await indexUser(user.id);

        await recoll.indexByGroupFolder('shared');

        const results = await recoll.searchByUsername(user.id, marker);
        assert.ok(results.length >= 1);
        assert.equal(results[0].fileName, 'shared-doc.txt');
    });
});
