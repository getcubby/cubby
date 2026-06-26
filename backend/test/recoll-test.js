import { describe, it, before, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import child_process from 'node:child_process';
import common from './common.js';
import paths from '../paths.js';
import exec from '../exec.js';
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
    const { databaseSetup, cleanup, admin, user, addUserFile } = common;

    before(function () {
        if (!RECOLL_AVAILABLE) this.skip();
    });

    beforeEach(databaseSetup);
    after(cleanup);

    function indexDbPath(username) {
        return path.join(paths.SEARCH_INDEX_PATH, username, 'xapiandb');
    }

    async function buildRecollConfig(username) {
        const configPath = path.join(paths.SEARCH_INDEX_PATH, username);
        fs.mkdirSync(configPath, { recursive: true });

        const pathsToIndex = [ path.join(paths.USER_DATA_ROOT, username) ];
        for (const groupFolder of await groupfolders.list(username)) {
            pathsToIndex.push(groupFolder.folderPath);
        }

        fs.writeFileSync(path.join(configPath, 'recoll.conf'), `topdirs = ${pathsToIndex.join(' ')}`);
        return configPath;
    }

    async function indexUser(username) {
        const configPath = await buildRecollConfig(username);
        await exec('recollindex', [ '-c', configPath ], { stdio: [ 'ignore', 'ignore', 'pipe' ] });
        assert.ok(fs.existsSync(indexDbPath(username)), 'recoll index was not created');
    }

    async function createUserWithIndexedFile(username, filePath, content) {
        await users.add({ username, email: `${username}@test.local`, displayName: username });
        await addUserFile(username, filePath, content);
        await indexUser(username);
    }

    it('can index and search user files', async function () {
        const marker = `recoll-user-marker-${Date.now()}`;
        await createUserWithIndexedFile(admin.username, '/search-me.txt', marker);

        const results = await recoll.searchByUsername(admin.username, marker);
        assert.ok(results.length >= 1);
        assert.equal(results[0].fileName, 'search-me.txt');
        assert.ok(results[0].entry.filePath.endsWith('search-me.txt'));
    });

    it('can index and search groupfolder files', async function () {
        const marker = `recoll-group-marker-${Date.now()}`;

        await users.add(admin);
        await users.add(user);
        await groupfolders.add('team', 'Team', '', [ user.username ]);
        await addUserFile('groupfolder-team', '/team-doc.txt', marker);
        await indexUser(user.username);

        const results = await recoll.searchByUsername(user.username, marker);
        assert.ok(results.length >= 1);
        assert.equal(results[0].fileName, 'team-doc.txt');
    });

    it('builds an index on demand when searching', async function () {
        const marker = `recoll-ondemand-marker-${Date.now()}`;

        await users.add(admin);
        await addUserFile(admin.username, '/ondemand.txt', marker);
        assert.equal(fs.existsSync(indexDbPath(admin.username)), false);

        const results = await recoll.searchByUsername(admin.username, marker);
        assert.ok(fs.existsSync(indexDbPath(admin.username)), 'recoll index was not created');
        assert.ok(results.length >= 1);
        assert.equal(results[0].fileName, 'ondemand.txt');
    });

    it('can reindex members via indexByGroupFolder', async function () {
        const marker = `recoll-groupfolder-marker-${Date.now()}`;

        await users.add(user);
        await groupfolders.add('shared', 'Shared', '', [ user.username ]);
        await addUserFile('groupfolder-shared', '/shared-doc.txt', marker);
        await indexUser(user.username);

        await recoll.indexByGroupFolder('shared');

        const results = await recoll.searchByUsername(user.username, marker);
        assert.ok(results.length >= 1);
        assert.equal(results[0].fileName, 'shared-doc.txt');
    });
});
