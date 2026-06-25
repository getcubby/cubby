import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import Entry from '../entry.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let fixturePath = '';

function makeEntry(overrides = {}) {
    return new Entry({
        fullFilePath: fixturePath,
        filePath: '/folder/item.txt',
        fileName: 'item.txt',
        owner: 'owner',
        size: 12,
        mtime: new Date('2024-01-01T00:00:00.000Z'),
        atime: new Date('2024-01-01T00:00:00.000Z'),
        isDirectory: false,
        isFile: true,
        isShare: false,
        isGroup: false,
        mimeType: 'text/plain',
        files: [],
        sharedWith: [],
        share: null,
        group: null,
        favorites: [],
        ...overrides
    });
}

describe('entry', function () {
    before(function () {
        fixturePath = path.join(os.tmpdir(), `cubby-entry-test-${process.pid}.txt`);
        fs.writeFileSync(fixturePath, 'fixture');
    });

    after(function () {
        fs.rmSync(fixturePath, { force: true });
    });
    it('rewrites paths in asShare and hides sharedWith', function () {
        const child = makeEntry({
            filePath: '/shared/docs/readme.txt',
            fileName: 'readme.txt'
        });
        const parent = makeEntry({
            filePath: '/shared/docs',
            fileName: 'docs',
            isDirectory: true,
            isFile: false,
            mimeType: 'inode/directory',
            sharedWith: [ { id: 'sid-1' } ],
            files: [ child ]
        });

        const shared = parent.asShare('/shared/docs');
        assert.equal(shared.filePath, '/');
        assert.deepEqual(shared.sharedWith, []);
        assert.equal(shared.files[0].filePath, '/readme.txt');
        assert.deepEqual(shared.files[0].sharedWith, []);
    });

    it('returns a public view via withoutPrivate', function () {
        const favorite = { username: 'viewer', id: 'fid-1' };
        const entry = makeEntry({
            favorites: [ favorite ],
            sharedWith: [ { id: 'sid-1' } ]
        });

        const publicView = entry.withoutPrivate('viewer');
        assert.equal(publicView.fileName, 'item.txt');
        assert.equal(publicView.favorite.id, 'fid-1');
        assert.ok(publicView.previewUrl.includes('/mime-types/'));
        assert.equal(publicView.sharedWith.length, 1);
    });

    it('returns a mime icon preview url for regular files', function () {
        const entry = makeEntry({ mimeType: 'text/plain' });
        assert.equal(entry.getPreviewUrl(), '/mime-types/text-plain.svg');
    });
});
