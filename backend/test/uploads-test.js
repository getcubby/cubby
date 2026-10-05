import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import common from './common.js';
import uploads from '../uploads.js';

describe('uploads', function () {
    const { databaseSetup, cleanup } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    it('removes stale upload parts but keeps fresh ones', async function () {
        const stale = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

        // fresh single-shot part
        const freshPart = uploads.createPartFile();
        fs.writeFileSync(freshPart, 'data');

        // stale single-shot part
        const stalePart = uploads.createPartFile();
        fs.writeFileSync(stalePart, 'data');
        fs.utimesSync(stalePart, stale, stale);

        // fresh chunked session
        uploads.resetSession('fresh-session', { chunks: 3, received: 1, existed: false });
        fs.writeFileSync(uploads.partPath('fresh-session'), 'part');

        // stale chunked session (age is taken from the part file, which is updated on append)
        uploads.resetSession('stale-session', { chunks: 3, received: 1, existed: false });
        fs.writeFileSync(uploads.partPath('stale-session'), 'part');
        fs.utimesSync(uploads.partPath('stale-session'), stale, stale);

        await uploads.cleanupStale(60 * 60 * 1000); // 1 hour

        assert.equal(fs.existsSync(freshPart), true);
        assert.equal(fs.existsSync(stalePart), false);
        assert.equal(fs.existsSync(uploads.partPath('fresh-session')), true);
        assert.equal(fs.existsSync(uploads.partPath('stale-session')), false);
    });

    it('does not fail when there is nothing to clean', async function () {
        await uploads.cleanupStale(60 * 60 * 1000); // should not throw
    });
});
