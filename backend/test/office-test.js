import { describe, it, beforeEach, after } from 'mocha';
import assert from 'node:assert/strict';
import nock from 'nock';
import office from '../office.js';

describe('office', function () {
    beforeEach(function () {
        nock.cleanAll();
    });
    after(function () {
        nock.cleanAll();
    });

    it('returns empty string when no default office app is set', async function () {
        nock('http://127.0.0.1:3001')
            .get('/default-app/office')
            .reply(200, { domain: '' });

        assert.equal(await office.getWopiHost(), '');
    });

    it('returns the office origin of the default office app', async function () {
        nock('http://127.0.0.1:3001')
            .get('/default-app/office')
            .reply(200, { domain: 'office.example.com' });

        assert.equal(await office.getWopiHost(), 'https://office.example.com');
    });
});
