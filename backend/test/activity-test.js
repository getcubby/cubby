import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import activity from '../activity.js';
import relocate from '../relocate.js';
import files from '../files.js';
import groupfolders from '../groupfolders.js';
import users from '../users.js';

describe('activity', function () {
    const { databaseSetup, cleanup, alice, user, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    async function createUsers() {
        await users.add(alice);
        await users.add(user);
    }

    it('can log and list activity for a path', async function () {
        await createUsers();

        await activity.log({
            actor: alice.username,
            owner: alice.username,
            filePath: '/docs/report.txt',
            action: 'created'
        });

        const listed = await activity.listByPath(alice.username, '/docs/report.txt');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].actor, alice.username);
        assert.equal(listed[0].action, 'created');
    });

    it('can log updated and folder created actions', async function () {
        await createUsers();

        await activity.log({ actor: alice.username, owner: alice.username, filePath: '/docs/report.txt', action: 'updated' });
        await activity.log({ actor: alice.username, owner: alice.username, filePath: '/new-dir', action: 'created', details: { isDirectory: true } });

        const fileActivity = await activity.listByPath(alice.username, '/docs/report.txt');
        assert.equal(fileActivity.length, 1);
        assert.equal(fileActivity[0].action, 'updated');

        const folderActivity = await activity.listByPath(alice.username, '/new-dir');
        assert.equal(folderActivity.length, 1);
        assert.equal(folderActivity[0].action, 'created');
        assert.equal(folderActivity[0].details.isDirectory, true);
    });

    it('relocatePaths updates an exact file path', async function () {
        await createUsers();
        await addUserFile(alice.username, '/activity-move.txt', 'payload');

        await activity.log({
            actor: alice.username,
            owner: alice.username,
            filePath: '/activity-move.txt',
            action: 'created'
        });

        await activity.relocatePaths({
            fromOwner: alice.username,
            fromPath: '/activity-move.txt',
            toOwner: alice.username,
            toPath: '/activity-renamed.txt',
            isDirectory: false
        });

        assert.equal(await activity.listByPath(alice.username, '/activity-move.txt').then(r => r.length), 0);
        assert.equal((await activity.listByPath(alice.username, '/activity-renamed.txt'))[0].action, 'created');
    });

    it('relocatePaths updates folder activity and descendants', async function () {
        await createUsers();
        await files.addDirectory(alice.username, '/activity-dir');
        await addUserFile(alice.username, '/activity-dir/nested.txt', 'nested');

        await activity.log({
            actor: alice.username,
            owner: alice.username,
            filePath: '/activity-dir/nested.txt',
            action: 'created'
        });

        await activity.relocatePaths({
            fromOwner: alice.username,
            fromPath: '/activity-dir',
            toOwner: alice.username,
            toPath: '/moved-activity-dir',
            isDirectory: true
        });

        await files.addDirectory(alice.username, '/moved-activity-dir');

        const listed = await activity.listByPath(alice.username, '/moved-activity-dir');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].filePath, '/moved-activity-dir/nested.txt');
    });

    it('listByPath includes descendant activity for directories', async function () {
        await createUsers();
        await files.addDirectory(alice.username, '/activity-parent');
        await addUserFile(alice.username, '/activity-parent/child.txt', 'child');

        await activity.log({
            actor: alice.username,
            owner: alice.username,
            filePath: '/activity-parent/child.txt',
            action: 'updated'
        });

        const listed = await activity.listByPath(alice.username, '/activity-parent');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].filePath, '/activity-parent/child.txt');
    });

    it('logs created and updated via addOrOverwriteFileContents', async function () {
        await createUsers();

        await files.addOrOverwriteFileContents(alice.username, '/hook-created.txt', Buffer.from('v1'), null, true, { actor: alice.username });
        let listed = await activity.listByPath(alice.username, '/hook-created.txt');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].action, 'created');

        await files.addOrOverwriteFileContents(alice.username, '/hook-created.txt', Buffer.from('v2'), null, true, { actor: alice.username });
        listed = await activity.listByPath(alice.username, '/hook-created.txt');
        assert.equal(listed.length, 2);
        assert.equal(listed[0].action, 'updated');
    });

    it('logs created folder via addDirectory', async function () {
        await createUsers();

        await files.addDirectory(alice.username, '/hook-dir', { actor: alice.username });
        const listed = await activity.listByPath(alice.username, '/hook-dir');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].action, 'created');
        assert.equal(listed[0].details.isDirectory, true);
    });

    it('logs copied via copy', async function () {
        await createUsers();
        await addUserFile(alice.username, '/copy-src.txt', 'payload');

        await files.copy(alice.username, '/copy-src.txt', alice.username, '/copy-dst.txt', false, { actor: alice.username });

        const listed = await activity.listByPath(alice.username, '/copy-dst.txt');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].action, 'copied');
        assert.equal(listed[0].details.fromPath, '/copy-src.txt');
    });

    it('relocate logs a moved event', async function () {
        await createUsers();
        await addUserFile(alice.username, '/relocate-activity.txt', 'payload');

        await relocate.relocate({
            actor: alice.username,
            fromOwner: alice.username,
            fromPath: '/relocate-activity.txt',
            toOwner: alice.username,
            toPath: '/relocate-activity-renamed.txt'
        });

        const listed = await activity.listByPath(alice.username, '/relocate-activity-renamed.txt');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].action, 'moved');
        assert.equal(listed[0].details.toPath, '/relocate-activity-renamed.txt');
    });

    it('logs deleted after remove', async function () {
        await createUsers();
        await files.addOrOverwriteFileContents(alice.username, '/delete-me.txt', Buffer.from('payload'), null, true, { actor: alice.username });

        await files.remove(alice.username, '/delete-me.txt', { actor: alice.username });

        const listed = await activity.listByPath(alice.username, '/delete-me.txt');
        assert.equal(listed.length, 2);
        assert.equal(listed[0].action, 'deleted');
    });

    it('clears activity history when a path is recreated', async function () {
        await createUsers();
        await files.addOrOverwriteFileContents(alice.username, '/recreate.txt', Buffer.from('v1'), null, true, { actor: alice.username });
        await files.addOrOverwriteFileContents(alice.username, '/recreate.txt', Buffer.from('v2'), null, true, { actor: alice.username });
        await files.remove(alice.username, '/recreate.txt', { actor: alice.username });

        await files.addOrOverwriteFileContents(alice.username, '/recreate.txt', Buffer.from('v3'), null, true, { actor: alice.username });

        const listed = await activity.listByPath(alice.username, '/recreate.txt');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].action, 'created');
    });

    it('relocatePaths updates owner on cross-root move', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', alice.username);
        await addUserFile(alice.username, '/cross-activity.txt', 'cross');

        await activity.log({
            actor: alice.username,
            owner: alice.username,
            filePath: '/cross-activity.txt',
            action: 'created'
        });

        await activity.relocatePaths({
            fromOwner: alice.username,
            fromPath: '/cross-activity.txt',
            toOwner: 'groupfolder-team',
            toPath: '/cross-activity.txt',
            isDirectory: false
        });

        const listed = await activity.listByPath('groupfolder-team', '/cross-activity.txt');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].owner, 'groupfolder-team');
    });

    it('lastActivityAt returns the latest content action timestamp', async function () {
        await createUsers();

        await activity.log({ actor: alice.username, owner: alice.username, filePath: '/mtime.txt', action: 'created' });
        await activity.log({ actor: alice.username, owner: alice.username, filePath: '/mtime.txt', action: 'updated' });

        const last = await activity.lastActivityAt(alice.username, '/mtime.txt');
        assert.ok(last instanceof Date);

        const listed = await activity.listByPath(alice.username, '/mtime.txt');
        assert.equal(last.getTime(), listed[0].createdAt.getTime());
        assert.equal(listed[0].action, 'updated');
    });

    it('lastActivityAt ignores shared and unshared actions', async function () {
        await createUsers();

        await activity.log({ actor: alice.username, owner: alice.username, filePath: '/share-mtime.txt', action: 'shared', details: { shareId: 's1' } });
        assert.equal(await activity.lastActivityAt(alice.username, '/share-mtime.txt'), null);

        await activity.log({ actor: alice.username, owner: alice.username, filePath: '/share-mtime.txt', action: 'updated' });
        await activity.log({ actor: alice.username, owner: alice.username, filePath: '/share-mtime.txt', action: 'unshared', details: { shareId: 's1' } });

        const last = await activity.lastActivityAt(alice.username, '/share-mtime.txt');
        const listed = await activity.listByPath(alice.username, '/share-mtime.txt');
        assert.equal(last.getTime(), listed.find((row) => row.action === 'updated').createdAt.getTime());
    });

    it('lastActivityAt includes descendant activity when recursive', async function () {
        await createUsers();
        await files.addDirectory(alice.username, '/mtime-parent');
        await addUserFile(alice.username, '/mtime-parent/child.txt', 'child');

        await activity.log({ actor: alice.username, owner: alice.username, filePath: '/mtime-parent/child.txt', action: 'updated' });

        assert.equal(await activity.lastActivityAt(alice.username, '/mtime-parent', { recursive: false }), null);

        const last = await activity.lastActivityAt(alice.username, '/mtime-parent', { recursive: true });
        const childActivity = await activity.listByPath(alice.username, '/mtime-parent/child.txt');
        assert.equal(last.getTime(), childActivity[0].createdAt.getTime());
    });
});
