import { describe, it } from 'mocha';
import assert from 'node:assert/strict';
import password from '../password.js';

describe('password', function () {
    it('hashes and verifies a password', async function () {
        const stored = await password.hashPassword('hunter2');
        assert.ok(stored.includes(':'));
        assert.notEqual(stored, 'hunter2');
        assert.equal(await password.verifyPassword('hunter2', stored), true);
    });

    it('rejects an incorrect password', async function () {
        const stored = await password.hashPassword('correct-horse');
        assert.equal(await password.verifyPassword('wrong', stored), false);
    });

    it('produces distinct hashes for the same password', async function () {
        const a = await password.hashPassword('secret');
        const b = await password.hashPassword('secret');
        assert.notEqual(a, b);
    });
});
