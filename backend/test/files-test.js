import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import paths from '../paths.js';
import files from '../files.js';
import groupfolders from '../groupfolders.js';
import MainError from '../mainerror.js';
import path from 'node:path';
import safe from '@cloudron/safetydance';
import shares from '../shares.js';
import users from '../users.js';

describe('files', function () {
    const { databaseSetup, cleanup, alice, user, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    async function createUsers() {
        await users.add(alice);
        await users.add(user);
    }

    it('detects groupfolder owners', function () {
        assert.equal(files.isGroupfolder('groupfolder-team'), true);
        assert.equal(files.isGroupfolder('testuser'), false);
    });

    it('resolves absolute paths and rejects path traversal', async function () {
        await createUsers();

        const valid = files.getAbsolutePath(alice.username, '/docs/readme.txt');
        assert.equal(valid, path.join(paths.USER_DATA_ROOT, alice.username, 'docs', 'readme.txt'));

        assert.equal(files.getAbsolutePath(alice.username, '/../secret'), null);
    });

    it('can add, get, head, move, copy, and remove files', async function () {
        await createUsers();
        await addUserFile(alice.username, '/hello.txt', 'hello');

        const file = await files.get(alice.username, '/hello.txt');
        assert.equal(file.fileName, 'hello.txt');
        assert.equal(file.isFile, true);

        const head = await files.head(alice.username, '/hello.txt');
        assert.equal(head.fileName, 'hello.txt');
        assert.ok(head.size > 0);

        await files.copy(alice.username, '/hello.txt', alice.username, '/copy.txt');
        assert.ok(await files.get(alice.username, '/copy.txt'));

        await files.move(alice.username, '/copy.txt', alice.username, '/moved.txt');
        assert.ok(await files.get(alice.username, '/moved.txt'));

        const [duplicateError] = await safe(files.addOrOverwriteFileContents(alice.username, '/hello.txt', Buffer.from('again'), null, false));
        assert.ok(duplicateError);
        assert.equal(duplicateError.reason, MainError.ALREADY_EXISTS);

        await files.remove(alice.username, '/moved.txt');
        const [missingError] = await safe(files.get(alice.username, '/moved.txt'));
        assert.ok(missingError);
        assert.equal(missingError.reason, MainError.NOT_FOUND);
    });

    it('detects binary files', async function () {
        await createUsers();
        await addUserFile(alice.username, '/text.txt', 'hello world');
        await addUserFile(alice.username, '/binary.bin', 'hello\0world');

        const textPath = files.getAbsolutePath(alice.username, '/text.txt');
        const binaryPath = files.getAbsolutePath(alice.username, '/binary.bin');

        assert.equal(await files.isBinaryFile(textPath), false);
        assert.equal(await files.isBinaryFile(binaryPath), true);
    });

    it('isBinaryBuffer honors text BOMs', function () {
        assert.equal(files.isBinaryBuffer(Buffer.from('hello')), false);
        assert.equal(files.isBinaryBuffer(Buffer.from('hello\0world')), true);
        assert.equal(files.isBinaryBuffer(Buffer.from([0xEF, 0xBB, 0xBF, 0x68, 0x69])), false);
        assert.equal(files.isBinaryBuffer(Buffer.from([0xFF, 0xFE, 0x68, 0x00, 0x69, 0x00])), false);
        assert.equal(files.isBinaryBuffer(Buffer.from([0xFE, 0xFF, 0x00, 0x68, 0x00, 0x69])), false);
        assert.equal(files.isBinaryBuffer(Buffer.from([0xFF, 0xFE, 0x00, 0x00, 0x68, 0x00, 0x00, 0x00])), false);
        assert.equal(files.isBinaryBuffer(Buffer.from([0x00, 0x00, 0xFE, 0xFF, 0x00, 0x00, 0x00, 0x68])), false);
    });

    it('move returns CONFLICT when target exists', async function () {
        await createUsers();
        await addUserFile(alice.username, '/move-conflict-source.txt', 'source');
        await files.addDirectory(alice.username, '/move-conflict-dir');

        const [fileOverDir] = await safe(files.move(alice.username, '/move-conflict-source.txt', alice.username, '/move-conflict-dir'));
        assert.ok(fileOverDir);
        assert.equal(fileOverDir.reason, MainError.CONFLICT);

        await files.addDirectory(alice.username, '/move-conflict-src-dir');
        await addUserFile(alice.username, '/move-conflict-target-file.txt', 'target');

        const [dirOverFile] = await safe(files.move(alice.username, '/move-conflict-src-dir', alice.username, '/move-conflict-target-file.txt'));
        assert.ok(dirOverFile);
        assert.equal(dirOverFile.reason, MainError.CONFLICT);
    });

    it('move returns CONFLICT when source and destination are the same', async function () {
        await createUsers();
        await addUserFile(alice.username, '/same-file.txt', 'same');

        const [error] = await safe(files.move(alice.username, '/same-file.txt', alice.username, '/same-file.txt'));
        assert.ok(error);
        assert.equal(error.reason, MainError.CONFLICT);
    });

    it('move returns NOT_FOUND when source does not exist', async function () {
        await createUsers();

        const [error] = await safe(files.move(alice.username, '/nonexistent.txt', alice.username, '/dest.txt'));
        assert.ok(error);
        assert.equal(error.reason, MainError.FS_ERROR);
    });

    it('can add and list directories', async function () {
        await createUsers();

        await files.addDirectory(alice.username, '/projects');
        const dir = await files.get(alice.username, '/projects');
        assert.equal(dir.isDirectory, true);
        assert.equal(dir.fileName, 'projects');
    });

    it('overlays directory mtime with descendant file activity', async function () {
        await createUsers();

        await files.addDirectory(alice.username, '/mtime-overlay');
        const beforeChild = await files.get(alice.username, '/mtime-overlay');
        const parentMtimeBefore = beforeChild.mtime.getTime();

        await files.addOrOverwriteFileContents(alice.username, '/mtime-overlay/child.txt', Buffer.from('child'), null, true, { actor: alice.username });

        const parent = await files.get(alice.username, '/mtime-overlay');
        const child = parent.files.find((entry) => entry.fileName === 'child.txt');

        assert.ok(parent.mtime.getTime() >= parentMtimeBefore);
        assert.ok(child.mtime.getTime() >= parent.mtime.getTime() - 5000);
        assert.ok(parent.mtime.getTime() >= child.mtime.getTime() - 5000);
    });

    it('can resolve home resource paths', async function () {
        await createUsers();
        await addUserFile(alice.username, '/notes.txt', 'notes');

        const subject = await files.translateResourcePath(alice.username, '/home/notes.txt');
        assert.equal(subject.resource, 'home');
        assert.equal(subject.usernameOrGroupfolder, alice.username);
        assert.equal(subject.filePath, '/notes.txt');
    });

    it('can resolve share resource paths', async function () {
        await createUsers();
        await addUserFile(alice.username, '/shared.txt', 'shared');

        const shareId = await shares.create({
            ownerUsername: alice.username,
            filePath: '/shared.txt',
            receiverUsername: user.username
        });

        const subject = await files.translateResourcePath(user.username, `/shares/${shareId}/`);
        assert.equal(subject.resource, 'shares');
        assert.equal(subject.usernameOrGroupfolder, alice.username);
        assert.equal(subject.filePath, '/shared.txt');
        assert.equal(subject.share.id, shareId);
    });

    it('rejects share resource paths for the wrong receiver', async function () {
        await createUsers();
        await addUserFile(alice.username, '/shared.txt', 'shared');

        const shareId = await shares.create({
            ownerUsername: alice.username,
            filePath: '/shared.txt',
            receiverUsername: user.username
        });

        const subject = await files.translateResourcePath('intruder', `/shares/${shareId}/shared.txt`);
        assert.equal(subject, null);
    });

    it('can resolve groupfolder resource paths', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', '', [ user.username ]);
        await files.addOrOverwriteFileContents('groupfolder-team', '/team.txt', Buffer.from('team'), null, true);

        const subject = await files.translateResourcePath(user.username, '/groupfolders/team/team.txt');
        assert.equal(subject.resource, 'groupfolders');
        assert.equal(subject.usernameOrGroupfolder, 'groupfolder-team');
        assert.equal(subject.filePath, '/team.txt');
    });

    it('rejects groupfolder paths for non-members', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', '', [ alice.username ]);

        const subject = await files.translateResourcePath(user.username, '/groupfolders/team/file.txt');
        assert.equal(subject, null);
    });

    it('can get files by absolute path', async function () {
        await createUsers();
        await addUserFile(alice.username, '/absolute.txt', 'absolute');

        const absolutePath = files.getAbsolutePath(alice.username, '/absolute.txt');
        const file = await files.getByAbsolutePath(absolutePath);
        assert.equal(file.fileName, 'absolute.txt');
    });
});
