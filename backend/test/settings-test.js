import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import settings from '../settings.js';

describe('settings', function () {
    const { databaseSetup, cleanup } = common;

    beforeEach(databaseSetup);
    after(cleanup);

    it('returns null for unknown keys', async function () {
        assert.equal(await settings.get('missing'), null);
        assert.equal(await settings.getJson('missing'), null);
    });

    it('can set and get string values', async function () {
        await settings.set('test_key', 'hello');
        assert.equal(await settings.get('test_key'), 'hello');

        await settings.set('test_key', 'world');
        assert.equal(await settings.get('test_key'), 'world');
    });

    it('can set and get json values', async function () {
        await settings.setJson(settings.COLLABORA_KEY, { host: 'https://office.example.com' });

        const value = await settings.getJson(settings.COLLABORA_KEY);
        assert.deepEqual(value, { host: 'https://office.example.com' });
    });

    it('can clear json values', async function () {
        await settings.setJson(settings.COLLABORA_KEY, { host: 'https://office.example.com' });
        await settings.setJson(settings.COLLABORA_KEY, null);

        assert.equal(await settings.get(settings.COLLABORA_KEY), null);
        assert.equal(await settings.getJson(settings.COLLABORA_KEY), null);
    });
});
