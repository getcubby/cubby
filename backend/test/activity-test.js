import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import activity from '../activity.js';
import files from '../files.js';
import groupfolders from '../groupfolders.js';
import users from '../users.js';

describe('activity', function () {
    const { databaseSetup, cleanup, admin, user, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    async function createUsers() {
        await users.add(admin);
        await users.add(user);
    }

    it('can log and list activity for a path', async function () {
        await createUsers();

        await activity.log({
            actor: admin.username,
            owner: admin.username,
            filePath: '/docs/report.txt',
            action: 'created'
        });

        const listed = await activity.listByPath(admin.username, '/docs/report.txt');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].actor, admin.username);
        assert.equal(listed[0].action, 'created');
    });

    it('can log updated and folder created actions', async function () {
        await createUsers();

        await activity.log({ actor: admin.username, owner: admin.username, filePath: '/docs/report.txt', action: 'updated' });
        await activity.log({ actor: admin.username, owner: admin.username, filePath: '/new-dir', action: 'created', details: { isDirectory: true } });

        const fileActivity = await activity.listByPath(admin.username, '/docs/report.txt');
        assert.equal(fileActivity.length, 1);
        assert.equal(fileActivity[0].action, 'updated');

        const folderActivity = await activity.listByPath(admin.username, '/new-dir');
        assert.equal(folderActivity.length, 1);
        assert.equal(folderActivity[0].action, 'created');
        assert.equal(folderActivity[0].details.isDirectory, true);
    });

    it('relocatePaths updates an exact file path', async function () {
        await createUsers();
        await addUserFile(admin.username, '/activity-move.txt', 'payload');

        await activity.log({
            actor: admin.username,
            owner: admin.username,
            filePath: '/activity-move.txt',
            action: 'created'
        });

        await activity.relocatePaths({
            fromOwner: admin.username,
            fromPath: '/activity-move.txt',
            toOwner: admin.username,
            toPath: '/activity-renamed.txt',
            isDirectory: false
        });

        assert.equal(await activity.listByPath(admin.username, '/activity-move.txt').then(r => r.length), 0);
        assert.equal((await activity.listByPath(admin.username, '/activity-renamed.txt'))[0].action, 'created');
    });

    it('relocatePaths updates folder activity and descendants', async function () {
        await createUsers();
        await files.addDirectory(admin.username, '/activity-dir');
        await addUserFile(admin.username, '/activity-dir/nested.txt', 'nested');

        await activity.log({
            actor: admin.username,
            owner: admin.username,
            filePath: '/activity-dir/nested.txt',
            action: 'created'
        });

        await activity.relocatePaths({
            fromOwner: admin.username,
            fromPath: '/activity-dir',
            toOwner: admin.username,
            toPath: '/moved-activity-dir',
            isDirectory: true
        });

        await files.addDirectory(admin.username, '/moved-activity-dir');

        const listed = await activity.listByPath(admin.username, '/moved-activity-dir');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].filePath, '/moved-activity-dir/nested.txt');
    });

    it('listByPath includes descendant activity for directories', async function () {
        await createUsers();
        await files.addDirectory(admin.username, '/activity-parent');
        await addUserFile(admin.username, '/activity-parent/child.txt', 'child');

        await activity.log({
            actor: admin.username,
            owner: admin.username,
            filePath: '/activity-parent/child.txt',
            action: 'updated'
        });

        const listed = await activity.listByPath(admin.username, '/activity-parent');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].filePath, '/activity-parent/child.txt');
    });

    it('relocatePaths updates owner on cross-root move', async function () {
        await createUsers();
        await groupfolders.add('team', 'Team', '', [ admin.username ]);
        await addUserFile(admin.username, '/cross-activity.txt', 'cross');

        await activity.log({
            actor: admin.username,
            owner: admin.username,
            filePath: '/cross-activity.txt',
            action: 'created'
        });

        await activity.relocatePaths({
            fromOwner: admin.username,
            fromPath: '/cross-activity.txt',
            toOwner: 'groupfolder-team',
            toPath: '/cross-activity.txt',
            isDirectory: false
        });

        const listed = await activity.listByPath('groupfolder-team', '/cross-activity.txt');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].owner, 'groupfolder-team');
    });
});
