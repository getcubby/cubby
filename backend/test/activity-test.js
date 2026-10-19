import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import activity from '../activity.js';
import database from '../database.js';
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
            actor: alice.id,
            owner: alice.id,
            filePath: '/docs/report.txt',
            action: 'created'
        });

        const listed = await activity.listByPath(alice.id, '/docs/report.txt');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].actor, alice.id);
        assert.equal(listed[0].action, 'created');
        assert.match(listed[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
    });

    it('sets created_at when the column has no default', async function () {
        await createUsers();

        await database.query('BEGIN');
        try {
            await database.query(`CREATE TABLE file_activity_nodefault(
                id TEXT PRIMARY KEY,
                actor TEXT REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
                owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
                owner_groupfolder TEXT REFERENCES groupfolders(id),
                file_path TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                created_at TEXT NOT NULL
            )`);
            await database.query('DROP TABLE file_activity');
            await database.query('ALTER TABLE file_activity_nodefault RENAME TO file_activity');

            await activity.log({
                actor: alice.id,
                owner: alice.id,
                filePath: '/docs/report.txt',
                action: 'updated'
            });

            const listed = await activity.listByPath(alice.id, '/docs/report.txt');
            assert.equal(listed.length, 1);
            assert.equal(listed[0].action, 'updated');
            assert.match(listed[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
        } finally {
            await database.query('ROLLBACK');
        }
    });

    it('can log updated and folder created actions', async function () {
        await createUsers();

        await activity.log({ actor: alice.id, owner: alice.id, filePath: '/docs/report.txt', action: 'updated' });
        await activity.log({ actor: alice.id, owner: alice.id, filePath: '/new-dir', action: 'created', details: { isDirectory: true } });

        const fileActivity = await activity.listByPath(alice.id, '/docs/report.txt');
        assert.equal(fileActivity.length, 1);
        assert.equal(fileActivity[0].action, 'updated');

        const folderActivity = await activity.listByPath(alice.id, '/new-dir');
        assert.equal(folderActivity.length, 1);
        assert.equal(folderActivity[0].action, 'created');
        assert.equal(folderActivity[0].details.isDirectory, true);
    });

    it('relocatePaths updates an exact file path', async function () {
        await createUsers();
        await addUserFile(alice.username, '/activity-move.txt', 'payload');

        await activity.log({
            actor: alice.id,
            owner: alice.id,
            filePath: '/activity-move.txt',
            action: 'created'
        });

        await activity.relocatePaths({
            fromOwner: alice.id,
            fromPath: '/activity-move.txt',
            toOwner: alice.id,
            toPath: '/activity-renamed.txt',
            isDirectory: false
        });

        assert.equal(await activity.listByPath(alice.id, '/activity-move.txt').then(r => r.length), 0);
        assert.equal((await activity.listByPath(alice.id, '/activity-renamed.txt'))[0].action, 'created');
    });

    it('relocatePaths updates folder activity and descendants', async function () {
        await createUsers();
        await files.addDirectory(alice.id, '/activity-dir');
        await addUserFile(alice.username, '/activity-dir/nested.txt', 'nested');

        await activity.log({
            actor: alice.id,
            owner: alice.id,
            filePath: '/activity-dir/nested.txt',
            action: 'created'
        });

        await activity.relocatePaths({
            fromOwner: alice.id,
            fromPath: '/activity-dir',
            toOwner: alice.id,
            toPath: '/moved-activity-dir',
            isDirectory: true
        });

        await files.addDirectory(alice.id, '/moved-activity-dir');

        const listed = await activity.listByPath(alice.id, '/moved-activity-dir');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].filePath, '/moved-activity-dir/nested.txt');
    });

    it('listByPath includes descendant activity for directories', async function () {
        await createUsers();
        await files.addDirectory(alice.id, '/activity-parent');
        await addUserFile(alice.username, '/activity-parent/child.txt', 'child');

        await activity.log({
            actor: alice.id,
            owner: alice.id,
            filePath: '/activity-parent/child.txt',
            action: 'updated'
        });

        const listed = await activity.listByPath(alice.id, '/activity-parent');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].filePath, '/activity-parent/child.txt');
    });

    it('logs created and updated via addOrOverwriteFileContents', async function () {
        await createUsers();

        await files.addOrOverwriteFileContents(alice.id, '/hook-created.txt', Buffer.from('v1'), null, true, { actor: alice.id });
        let listed = await activity.listByPath(alice.id, '/hook-created.txt');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].action, 'created');

        await files.addOrOverwriteFileContents(alice.id, '/hook-created.txt', Buffer.from('v2'), null, true, { actor: alice.id });
        listed = await activity.listByPath(alice.id, '/hook-created.txt');
        assert.equal(listed.length, 2);
        assert.equal(listed[0].action, 'updated');
    });

    it('logs created folder via addDirectory', async function () {
        await createUsers();

        await files.addDirectory(alice.id, '/hook-dir', { actor: alice.id });
        const listed = await activity.listByPath(alice.id, '/hook-dir');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].action, 'created');
        assert.equal(listed[0].details.isDirectory, true);
    });

    it('logs anonymous updates with a null actor and share details', async function () {
        await createUsers();

        await files.addOrOverwriteFileContents(alice.id, '/anon-update.txt', Buffer.from('v1'), null, true, { actor: alice.id });
        await files.addOrOverwriteFileContents(alice.id, '/anon-update.txt', Buffer.from('v2'), null, true, { actor: null, details: { shareId: 'sid-1' } });

        const listed = await activity.listByPath(alice.id, '/anon-update.txt');
        assert.equal(listed.length, 2);
        assert.equal(listed[0].action, 'updated');
        assert.equal(listed[0].actor, null);
        assert.equal(listed[0].details.shareId, 'sid-1');
    });

    it('logs copied via copy', async function () {
        await createUsers();
        await addUserFile(alice.username, '/copy-src.txt', 'payload');

        await files.copy(alice.id, '/copy-src.txt', alice.id, '/copy-dst.txt', false, { actor: alice.id });

        const listed = await activity.listByPath(alice.id, '/copy-dst.txt');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].action, 'copied');
        assert.equal(listed[0].details.fromPath, '/copy-src.txt');
    });

    it('relocate logs a moved event', async function () {
        await createUsers();
        await addUserFile(alice.username, '/relocate-activity.txt', 'payload');

        await relocate.relocate({
            actor: alice.id,
            fromOwner: alice.id,
            fromPath: '/relocate-activity.txt',
            toOwner: alice.id,
            toPath: '/relocate-activity-renamed.txt'
        });

        const listed = await activity.listByPath(alice.id, '/relocate-activity-renamed.txt');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].action, 'moved');
        assert.equal(listed[0].details.toPath, '/relocate-activity-renamed.txt');
    });

    it('logs deleted after remove', async function () {
        await createUsers();
        await files.addOrOverwriteFileContents(alice.id, '/delete-me.txt', Buffer.from('payload'), null, true, { actor: alice.id });

        await files.remove(alice.id, '/delete-me.txt', { actor: alice.id });

        const listed = await activity.listByPath(alice.id, '/delete-me.txt');
        assert.equal(listed.length, 2);
        assert.equal(listed[0].action, 'deleted');
    });

    it('clears activity history when a path is recreated', async function () {
        await createUsers();
        await files.addOrOverwriteFileContents(alice.id, '/recreate.txt', Buffer.from('v1'), null, true, { actor: alice.id });
        await files.addOrOverwriteFileContents(alice.id, '/recreate.txt', Buffer.from('v2'), null, true, { actor: alice.id });
        await files.remove(alice.id, '/recreate.txt', { actor: alice.id });

        await files.addOrOverwriteFileContents(alice.id, '/recreate.txt', Buffer.from('v3'), null, true, { actor: alice.id });

        const listed = await activity.listByPath(alice.id, '/recreate.txt');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].action, 'created');
    });

    it('relocatePaths updates owner on cross-root move', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', alice.id);
        await addUserFile(alice.username, '/cross-activity.txt', 'cross');

        await activity.log({
            actor: alice.id,
            owner: alice.id,
            filePath: '/cross-activity.txt',
            action: 'created'
        });

        await activity.relocatePaths({
            fromOwner: alice.id,
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

        await activity.log({ actor: alice.id, owner: alice.id, filePath: '/mtime.txt', action: 'created' });
        await activity.log({ actor: alice.id, owner: alice.id, filePath: '/mtime.txt', action: 'updated' });

        const last = await activity.lastActivityAt(alice.id, '/mtime.txt');
        assert.ok(last instanceof Date);

        const listed = await activity.listByPath(alice.id, '/mtime.txt');
        assert.equal(last.getTime(), new Date(listed[0].createdAt).getTime());
        assert.equal(listed[0].action, 'updated');
    });

    it('lastActivityAt ignores shared and unshared actions', async function () {
        await createUsers();

        await activity.log({ actor: alice.id, owner: alice.id, filePath: '/share-mtime.txt', action: 'shared', details: { shareId: 's1' } });
        assert.equal(await activity.lastActivityAt(alice.id, '/share-mtime.txt'), null);

        await activity.log({ actor: alice.id, owner: alice.id, filePath: '/share-mtime.txt', action: 'updated' });
        await activity.log({ actor: alice.id, owner: alice.id, filePath: '/share-mtime.txt', action: 'unshared', details: { shareId: 's1' } });

        const last = await activity.lastActivityAt(alice.id, '/share-mtime.txt');
        const listed = await activity.listByPath(alice.id, '/share-mtime.txt');
        assert.equal(last.getTime(), new Date(listed.find((row) => row.action === 'updated').createdAt).getTime());
    });

    it('lastActivityAt includes descendant activity when recursive', async function () {
        await createUsers();
        await files.addDirectory(alice.id, '/mtime-parent');
        await addUserFile(alice.username, '/mtime-parent/child.txt', 'child');

        await activity.log({ actor: alice.id, owner: alice.id, filePath: '/mtime-parent/child.txt', action: 'updated' });

        assert.equal(await activity.lastActivityAt(alice.id, '/mtime-parent', { recursive: false }), null);

        const last = await activity.lastActivityAt(alice.id, '/mtime-parent', { recursive: true });
        const childActivity = await activity.listByPath(alice.id, '/mtime-parent/child.txt');
        assert.equal(last.getTime(), new Date(childActivity[0].createdAt).getTime());
    });
});
