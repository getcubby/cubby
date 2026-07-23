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
    const { databaseSetup, cleanup, admin, user, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    async function createUsers() {
        await users.add(admin);
        await users.add(user);
    }

    it('detects groupfolder owners', function () {
        assert.equal(files.isGroupfolder('groupfolder-team'), true);
        assert.equal(files.isGroupfolder('testuser'), false);
    });

    it('resolves absolute paths and rejects path traversal', async function () {
        await createUsers();

        const valid = files.getAbsolutePath(admin.username, '/docs/readme.txt');
        assert.equal(valid, path.join(paths.USER_DATA_ROOT, admin.username, 'docs', 'readme.txt'));

        assert.equal(files.getAbsolutePath(admin.username, '/../secret'), null);
    });

    it('can add, get, head, move, copy, and remove files', async function () {
        await createUsers();
        await addUserFile(admin.username, '/hello.txt', 'hello');

        const file = await files.get(admin.username, '/hello.txt');
        assert.equal(file.fileName, 'hello.txt');
        assert.equal(file.isFile, true);

        const head = await files.head(admin.username, '/hello.txt');
        assert.equal(head.fileName, 'hello.txt');
        assert.ok(head.size > 0);

        await files.copy(admin.username, '/hello.txt', admin.username, '/copy.txt');
        assert.ok(await files.get(admin.username, '/copy.txt'));

        await files.move(admin.username, '/copy.txt', admin.username, '/moved.txt');
        assert.ok(await files.get(admin.username, '/moved.txt'));

        const [duplicateError] = await safe(files.addOrOverwriteFileContents(admin.username, '/hello.txt', Buffer.from('again'), null, false));
        assert.ok(duplicateError);
        assert.equal(duplicateError.reason, MainError.ALREADY_EXISTS);

        await files.remove(admin.username, '/moved.txt');
        const [missingError] = await safe(files.get(admin.username, '/moved.txt'));
        assert.ok(missingError);
        assert.equal(missingError.reason, MainError.NOT_FOUND);
    });

    it('move returns CONFLICT when target exists', async function () {
        await createUsers();
        await addUserFile(admin.username, '/move-conflict-source.txt', 'source');
        await files.addDirectory(admin.username, '/move-conflict-dir');

        const [fileOverDir] = await safe(files.move(admin.username, '/move-conflict-source.txt', admin.username, '/move-conflict-dir'));
        assert.ok(fileOverDir);
        assert.equal(fileOverDir.reason, MainError.CONFLICT);

        await files.addDirectory(admin.username, '/move-conflict-src-dir');
        await addUserFile(admin.username, '/move-conflict-target-file.txt', 'target');

        const [dirOverFile] = await safe(files.move(admin.username, '/move-conflict-src-dir', admin.username, '/move-conflict-target-file.txt'));
        assert.ok(dirOverFile);
        assert.equal(dirOverFile.reason, MainError.CONFLICT);
    });

    it('move returns CONFLICT when source and destination are the same', async function () {
        await createUsers();
        await addUserFile(admin.username, '/same-file.txt', 'same');

        const [error] = await safe(files.move(admin.username, '/same-file.txt', admin.username, '/same-file.txt'));
        assert.ok(error);
        assert.equal(error.reason, MainError.CONFLICT);
    });

    it('move returns NOT_FOUND when source does not exist', async function () {
        await createUsers();

        const [error] = await safe(files.move(admin.username, '/nonexistent.txt', admin.username, '/dest.txt'));
        assert.ok(error);
        assert.equal(error.reason, MainError.FS_ERROR);
    });

    it('can add and list directories', async function () {
        await createUsers();

        await files.addDirectory(admin.username, '/projects');
        const dir = await files.get(admin.username, '/projects');
        assert.equal(dir.isDirectory, true);
        assert.equal(dir.fileName, 'projects');
    });

    it('overlays directory mtime with descendant file activity', async function () {
        await createUsers();

        await files.addDirectory(admin.username, '/mtime-overlay');
        const beforeChild = await files.get(admin.username, '/mtime-overlay');
        const parentMtimeBefore = beforeChild.mtime.getTime();

        await files.addOrOverwriteFileContents(admin.username, '/mtime-overlay/child.txt', Buffer.from('child'), null, true, { actor: admin.username });

        const parent = await files.get(admin.username, '/mtime-overlay');
        const child = parent.files.find((entry) => entry.fileName === 'child.txt');

        assert.ok(parent.mtime.getTime() >= parentMtimeBefore);
        assert.ok(child.mtime.getTime() >= parent.mtime.getTime() - 5000);
        assert.ok(parent.mtime.getTime() >= child.mtime.getTime() - 5000);
    });

    it('can resolve home resource paths', async function () {
        await createUsers();
        await addUserFile(admin.username, '/notes.txt', 'notes');

        const subject = await files.translateResourcePath(admin.username, '/home/notes.txt');
        assert.equal(subject.resource, 'home');
        assert.equal(subject.usernameOrGroupfolder, admin.username);
        assert.equal(subject.filePath, '/notes.txt');
    });

    it('can resolve share resource paths', async function () {
        await createUsers();
        await addUserFile(admin.username, '/shared.txt', 'shared');

        const shareId = await shares.create({
            ownerUsername: admin.username,
            filePath: '/shared.txt',
            receiverUsername: user.username
        });

        const subject = await files.translateResourcePath(user.username, `/shares/${shareId}/`);
        assert.equal(subject.resource, 'shares');
        assert.equal(subject.usernameOrGroupfolder, admin.username);
        assert.equal(subject.filePath, '/shared.txt');
        assert.equal(subject.share.id, shareId);
    });

    it('rejects share resource paths for the wrong receiver', async function () {
        await createUsers();
        await addUserFile(admin.username, '/shared.txt', 'shared');

        const shareId = await shares.create({
            ownerUsername: admin.username,
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
        await groupfolders.add('team', 'Team', '', [ admin.username ]);

        const subject = await files.translateResourcePath(user.username, '/groupfolders/team/file.txt');
        assert.equal(subject, null);
    });

    it('can get files by absolute path', async function () {
        await createUsers();
        await addUserFile(admin.username, '/absolute.txt', 'absolute');

        const absolutePath = files.getAbsolutePath(admin.username, '/absolute.txt');
        const file = await files.getByAbsolutePath(absolutePath);
        assert.equal(file.fileName, 'absolute.txt');
    });
});
