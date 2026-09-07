import { describe, it } from 'mocha';
import assert from 'node:assert/strict';
import password from '../password.js';

describe('password', function () {
    it('hashes and verifies a password', function () {
        const stored = password.hashPassword('hunter2');
        assert.ok(stored.includes(':'));
        assert.notEqual(stored, 'hunter2');
        assert.equal(password.verifyPassword('hunter2', stored), true);
    });

    it('rejects an incorrect password', function () {
        const stored = password.hashPassword('correct-horse');
        assert.equal(password.verifyPassword('wrong', stored), false);
    });

    it('produces distinct hashes for the same password', function () {
        assert.notEqual(password.hashPassword('secret'), password.hashPassword('secret'));
    });
});
