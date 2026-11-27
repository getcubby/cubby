import { describe, it, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import office from '../office.js';

describe('office', function () {
    afterEach(function () {
        delete process.env.OFFICE_ORIGIN;
    });

    it('returns empty string when OFFICE_ORIGIN is unset', function () {
        delete process.env.OFFICE_ORIGIN;
        assert.equal(office.envOfficeOrigin(), '');
    });

    it('returns OFFICE_ORIGIN when it is set', async function () {
        process.env.OFFICE_ORIGIN = 'https://office.example.com/';
        assert.equal(await office.getWopiHost(), 'https://office.example.com');
    });
});
