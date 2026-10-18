import { describe, it, before, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import child_process from 'node:child_process';
import common from './common.js';
import exec from '../exec.js';
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
        assert.ok(config.includes('helperlogfilename = /dev/null'));
        assert.ok(config.includes('idxloglevel = 4'));
        assert.ok(config.includes('excludedmimetypes = application/zip application/x-zip-compressed application/x-7z-compressed application/x-rar application/x-rar-compressed application/x-tar'));
        assert.ok(config.includes('zipSkippedNames = __MACOSX/* */._*'));
        assert.ok(config.includes('skippedNames+ = ~$* .DS_Store Thumbs.db ._*'));
        assert.ok(config.includes('noContentSuffixes+ = .dmg .iso .img .vmdk .vdi .qcow2'));
    });

    it('honors the skipped paths list', async function () {
        const marker = `recoll-skip-marker-${Date.now()}`;
        await users.add(alice);
        await addUserFile(alice.username, '/dir with space/skipped.txt', marker);

        const configPath = path.join(paths.SEARCH_INDEX_PATH, alice.id);
        fs.mkdirSync(configPath, { recursive: true });

        const skippedFilePath = path.join(paths.USER_DATA_ROOT, alice.id, 'dir with space', 'skipped.txt');
        fs.writeFileSync(path.join(configPath, 'skipped-paths.json'), JSON.stringify([ skippedFilePath ]));

        await indexUser(alice.id);

        assert.equal((await recoll.searchByUsername(alice.id, marker)).length, 0);
        const config = fs.readFileSync(path.join(configPath, 'recoll.conf'), 'utf8');
        assert.ok(config.includes(`skippedPaths = "${skippedFilePath}"`));
    });

    it('skips the current file and retries after SIGKILL', async function () {
        await users.add(alice);
        await addUserFile(alice.username, '/killed.txt', 'killed marker');

        const killedFilePath = path.join(paths.USER_DATA_ROOT, alice.id, 'killed.txt');
        const configPath = path.join(paths.SEARCH_INDEX_PATH, alice.id);
        fs.mkdirSync(paths.THUMBNAIL_ROOT, { recursive: true });
        const fakeBin = fs.mkdtempSync(path.join(paths.THUMBNAIL_ROOT, 'fake-bin-'));
        const fakeRecollIndex = path.join(fakeBin, 'recollindex');
        const attemptsFile = path.join(fakeBin, 'attempts');
        // recoll truncates idxstatus.txt paths at a fixed length
        const truncatedPath = `${path.dirname(killedFilePath)}/killed \\`;

        const script = [
            '#!/bin/sh',
            'config=""',
            'while [ $# -gt 0 ]; do',
            '    if [ "$1" = "-c" ]; then config="$2"; shift 2; else shift; fi',
            'done',
            `echo x >> "${attemptsFile}"`,
            'if grep -q "skippedPaths" "$config/recoll.conf"; then exit 0; fi',
            'cat > "$config/idxstatus.txt" <<\'EOF\'',
            'phase = 1',
            'docsdone = 1',
            'filesdone = 0',
            'fileerrors = 0',
            'dbtotdocs = 0',
            'totfiles = 0',
            `fn = ${truncatedPath}`,
            'hasmonitor = 0',
            'EOF',
            `echo ":4:../internfile/internfile.cpp:185::FileInterner::init fn [${killedFilePath}] mime [(null)] preview 0" >&2`,
            'kill -9 $$'
        ].join('\n');
        fs.writeFileSync(fakeRecollIndex, script, { mode: 0o755 });

        const oldPath = process.env.PATH;
        process.env.PATH = `${fakeBin}:${oldPath}`;

        let attempts;
        try {
            await recoll.indexByUsername(alice.id);
            attempts = fs.readFileSync(attemptsFile, 'utf8').trim().split('\n').length;
        } finally {
            process.env.PATH = oldPath;
            fs.rmSync(fakeBin, { recursive: true, force: true });
        }

        assert.equal(attempts, 2);
        const skippedPaths = JSON.parse(fs.readFileSync(path.join(configPath, 'skipped-paths.json'), 'utf8'));
        assert.deepEqual(skippedPaths, [ killedFilePath ]);
    });

    it('does not index archive contents', async function () {
        if (!hasCommand('python3')) this.skip();

        const marker = `recoll-archive-marker-${Date.now()}`;
        await users.add(alice);

        const userHome = path.join(paths.USER_DATA_ROOT, alice.id);
        fs.mkdirSync(userHome, { recursive: true });

        const zipPath = path.join(userHome, 'archive.zip');
        const script = [
            'import sys, zipfile',
            'with zipfile.ZipFile(sys.argv[1], "w") as archive:',
            '    archive.writestr("inside.txt", sys.argv[2])'
        ].join('\n');
        await exec('python3', [ '-c', script, zipPath, marker ]);

        await indexUser(alice.id);

        assert.equal((await recoll.searchByUsername(alice.id, marker)).length, 0, 'archive member was indexed');

        const results = await recoll.searchByUsername(alice.id, 'archive.zip');
        assert.ok(results.some((result) => result.fileName === 'archive.zip'), 'archive file name was not indexed');
    });

    it('does not index disk image contents', async function () {
        if (!hasCommand('python3')) this.skip();

        const marker = `recoll-dmg-marker-${Date.now()}`;
        await users.add(alice);

        const userHome = path.join(paths.USER_DATA_ROOT, alice.id);
        fs.mkdirSync(userHome, { recursive: true });

        const dmgPath = path.join(userHome, 'disk.dmg');
        const script = [
            'import bz2, sys',
            'with open(sys.argv[1], "wb") as image:',
            '    image.write(bz2.compress(sys.argv[2].encode()))'
        ].join('\n');
        await exec('python3', [ '-c', script, dmgPath, marker ]);

        await indexUser(alice.id);

        assert.equal((await recoll.searchByUsername(alice.id, marker)).length, 0, 'disk image contents were indexed');

        const results = await recoll.searchByUsername(alice.id, 'disk.dmg');
        assert.ok(results.some((result) => result.fileName === 'disk.dmg'), 'disk image file name was not indexed');
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
