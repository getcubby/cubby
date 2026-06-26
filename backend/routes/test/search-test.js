import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import child_process from 'node:child_process';
import common from './common.js';
import paths from '../../paths.js';
import exec from '../../exec.js';
import fs from 'node:fs';
import groupfolders from '../../groupfolders.js';
import path from 'node:path';
import superagent from '@cloudron/superagent';

function hasCommand(command) {
    try {
        child_process.execSync(`command -v ${command}`, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

const RECOLL_AVAILABLE = hasCommand('recoll') && hasCommand('recollindex');

describe('search API', function () {
    const { setup, cleanup, serverUrl, admin, user, withToken, addUserFile } = common;

    before(function () {
        if (!RECOLL_AVAILABLE) this.skip();
    });

    before(setup);
    after(cleanup);

    function indexDbPath(username) {
        return path.join(paths.SEARCH_INDEX_PATH, username, 'xapiandb');
    }

    async function indexUser(username) {
        const configPath = path.join(paths.SEARCH_INDEX_PATH, username);
        fs.mkdirSync(configPath, { recursive: true });

        const pathsToIndex = [ path.join(paths.USER_DATA_ROOT, username) ];
        for (const groupFolder of await groupfolders.list(username)) {
            pathsToIndex.push(groupFolder.folderPath);
        }

        fs.writeFileSync(path.join(configPath, 'recoll.conf'), `topdirs = ${pathsToIndex.join(' ')}`);
        await exec('recollindex', [ '-c', configPath ], { stdio: [ 'ignore', 'ignore', 'pipe' ] });
        assert.ok(fs.existsSync(indexDbPath(username)), 'recoll index was not created');
    }

    it('requires authentication', async function () {
        const response = await superagent.get(`${serverUrl}/api/v1/search`)
            .query({ query: 'anything' })
            .ok(() => true);
        assert.equal(response.status, 401);
    });

    it('requires a non-empty query', async function () {
        const response = await withToken(superagent.get(`${serverUrl}/api/v1/search`), admin.token)
            .ok(() => true);
        assert.equal(response.status, 400);
    });

    it('can search indexed files', async function () {
        const marker = `search-route-marker-${Date.now()}`;

        await addUserFile(admin.username, '/search-route.txt', marker);
        await indexUser(admin.username);

        const response = await withToken(superagent.get(`${serverUrl}/api/v1/search`), admin.token)
            .query({ query: marker });
        assert.equal(response.status, 200);
        assert.ok(response.body.results.length >= 1);
        assert.equal(response.body.results[0].fileName, 'search-route.txt');
        assert.ok(response.body.results[0].entry.filePath.endsWith('search-route.txt'));
    });

    it('builds an index on demand when searching', async function () {
        const marker = `search-route-ondemand-${Date.now()}`;

        await addUserFile(user.username, '/search-ondemand.txt', marker);
        assert.equal(fs.existsSync(indexDbPath(user.username)), false);

        const response = await withToken(superagent.get(`${serverUrl}/api/v1/search`), user.token)
            .query({ query: marker });
        assert.equal(response.status, 200);
        assert.ok(fs.existsSync(indexDbPath(user.username)), 'recoll index was not created');
        assert.ok(response.body.results.length >= 1);
        assert.equal(response.body.results[0].fileName, 'search-ondemand.txt');
    });
});
