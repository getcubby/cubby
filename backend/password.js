import assert from 'assert';
import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// stored format: "<saltHex>:<hashHex>"
async function hashPassword(password) {
    assert.strictEqual(typeof password, 'string');

    const salt = crypto.randomBytes(SALT_LENGTH);
    const hash = await scrypt(password, salt, KEY_LENGTH);

    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof stored, 'string');

    const parts = stored.split(':');
    if (parts.length !== 2) return false;

    const salt = Buffer.from(parts[0], 'hex');
    const expected = Buffer.from(parts[1], 'hex');
    if (salt.length === 0 || expected.length === 0) return false;

    const actual = await scrypt(password, salt, expected.length);

    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// whether the given session has unlocked a password-protected resource
function isUnlocked(req, bucket, id) {
    assert.strictEqual(typeof bucket, 'string');
    assert.strictEqual(typeof id, 'string');

    return !!(req.session && req.session[bucket] && req.session[bucket][id]);
}

export default {
    hashPassword,
    verifyPassword,
    isUnlocked
};
