import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import common from './common.js';
import files from '../files.js';
import preview from '../preview.js';
import { MINIMAL_PNG, waitForPreview } from './preview-helper.js';
import users from '../users.js';

describe('preview', function () {
    const { databaseSetup, cleanup, admin, addUserFile } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    it('returns null for unsupported mime types', function () {
        assert.equal(preview.getHash('text/plain', '/tmp/example.txt'), null);
        assert.equal(preview.getLocalPath('deadbeef'), null);
    });

    it('generates a thumbnail for supported images', async function () {
        await users.add(admin);
        await addUserFile(admin.username, '/preview-model.png', MINIMAL_PNG);

        const fullFilePath = files.getAbsolutePath(admin.username, '/preview-model.png');
        const hash = preview.getHash('image/png', fullFilePath);
        assert.ok(hash);

        const localPath = await waitForPreview(hash);
        assert.equal(localPath, preview.getLocalPath(hash));
    });

    it('does not regenerate an existing thumbnail', async function () {
        await users.add(admin);
        await addUserFile(admin.username, '/preview-cached.png', MINIMAL_PNG);

        const fullFilePath = files.getAbsolutePath(admin.username, '/preview-cached.png');
        const hash = preview.getHash('image/png', fullFilePath);
        const localPath = await waitForPreview(hash);
        const mtimeMs = fs.statSync(localPath).mtimeMs;

        preview.getHash('image/png', fullFilePath);
        await new Promise((resolve) => setTimeout(resolve, 500));

        assert.equal(fs.statSync(localPath).mtimeMs, mtimeMs);
    });
});
