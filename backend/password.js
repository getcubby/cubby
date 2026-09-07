import assert from 'assert';
import crypto from 'crypto';

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// stored format: "<saltHex>:<hashHex>"
function hashPassword(password) {
    assert.strictEqual(typeof password, 'string');

    const salt = crypto.randomBytes(SALT_LENGTH);
    const hash = crypto.scryptSync(password, salt, KEY_LENGTH);

    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof stored, 'string');

    const parts = stored.split(':');
    if (parts.length !== 2) return false;

    const salt = Buffer.from(parts[0], 'hex');
    const expected = Buffer.from(parts[1], 'hex');
    if (salt.length === 0 || expected.length === 0) return false;

    const actual = crypto.scryptSync(password, salt, expected.length);

    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export default {
    hashPassword,
    verifyPassword
};
