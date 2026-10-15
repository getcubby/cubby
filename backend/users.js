import assert from 'assert';
import paths from './paths.js';
import { cp } from 'node:fs/promises';
import debug from 'debug';
import database from './database.js';
import fs from 'node:fs';
import path from 'path';
import tokens from './tokens.js';
import MainError from './mainerror.js';
import safe from '@cloudron/safetydance';
import { scim } from '@cloudron/tegel';

const debugLog = debug('cubby:users');

function postProcess(data) {
    data.displayName = data.display_name;
    delete data.display_name;

    data.active = !!data.active;

    return data;
}

function homeDir(userId) {
    return path.join(paths.USER_DATA_ROOT, userId);
}

function renameHome(fromId, toId) {
    if (fromId === toId) return;

    const from = homeDir(fromId);
    const to = homeDir(toId);
    if (!fs.existsSync(from) || fs.existsSync(to)) return;

    fs.renameSync(from, to);
}

function scimUserNameFilter(username) {
    const escaped = String(username).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `userName eq "${escaped}"`;
}

async function add(user) {
    assert.strictEqual(typeof user, 'object');
    assert.strictEqual(typeof user.id, 'string');
    assert.strictEqual(typeof user.username, 'string');

    const email = user.email;
    const displayName = user.displayName;

    const [error] = await safe(database.query('INSERT INTO users (id, username, email, display_name) VALUES (?, ?, ?, ?)', [ user.id, user.username, email, displayName ]));
    if (error?.nestedError?.code && [ 'SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY' ].includes(error.nestedError.code)) throw new MainError(MainError.ALREADY_EXISTS, 'user already exists');
    if (error) throw error;

    debugLog(`add: copy skeleton folder for ${user.id}`);
    await cp(paths.SKELETON_FOLDER, homeDir(user.id), { recursive: true });
}

async function get(id) {
    assert.strictEqual(typeof id, 'string');

    const result = await database.query('SELECT * FROM users WHERE id = ?', [ id ]);
    if (result.rows.length === 0) return null;

    return postProcess(result.rows[0]);
}

async function getByUsername(username) {
    assert.strictEqual(typeof username, 'string');

    const result = await database.query('SELECT * FROM users WHERE username = ?', [ username ]);
    if (result.rows.length === 0) return null;

    return postProcess(result.rows[0]);
}

async function exists(id) {
    assert.strictEqual(typeof id, 'string');

    return await get(id) !== null;
}

async function getByAccessToken(accessToken) {
    assert.strictEqual(typeof accessToken, 'string');

    const token = await tokens.get(accessToken);
    if (!token) return null;

    return await get(token.user_id);
}

async function list() {
    const users = await database.query('SELECT * FROM users ORDER BY username');

    users.rows.forEach(postProcess);

    return users.rows;
}

async function update(id, user) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof user, 'object');

    await database.query('UPDATE users SET username = ?, email = ?, display_name = ? WHERE id = ?', [ user.username, user.email, user.displayName, id ]);
}

async function setActive(id, active) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof active, 'boolean');

    await database.query('UPDATE users SET active = ? WHERE id = ?', [ active, id ]);
}

// Point an existing row at a Cloudron id and move its home directory with it.
async function replaceId(oldId, newId) {
    assert.strictEqual(typeof oldId, 'string');
    assert.strictEqual(typeof newId, 'string');
    if (oldId === newId) return;

    await database.query('UPDATE users SET id = ? WHERE id = ?', [ newId, oldId ]);
    renameHome(oldId, newId);
}

async function ensureUser(data) {
    const { id, username, email, displayName } = data;
    const contact = { username, email, displayName };

    if (id && await get(id)) {
        await update(id, contact);
        await setActive(id, true);
        return await get(id);
    }

    const byName = username ? await getByUsername(username) : null;
    if (byName) {
        if (id && byName.id !== id) await replaceId(byName.id, id);
        const currentId = id || byName.id;
        await update(currentId, contact);
        await setActive(currentId, true);
        return await get(currentId);
    }

    const userId = id || `local-${username}`;
    await add({ id: userId, username, email, displayName });
    return await get(userId);
}

/**
 * Create or update a directory user. The id is the Cloudron user id.
 * A row that already uses this username under a placeholder id is adopted.
 * @param {string} id
 * @param {{ username: string, displayName: string, email: string }} contact
 * @returns {Promise<{ created: boolean, updated: boolean }>}
 */
async function upsertFromScim(id, contact) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof contact.username, 'string');

    const username = contact.username;
    const email = contact.email != null && String(contact.email).trim()
        ? String(contact.email).trim()
        : '';
    const displayName = contact.displayName != null && String(contact.displayName).trim()
        ? String(contact.displayName).trim()
        : username.split('@')[0];
    const profile = { username, email, displayName };

    if (await exists(id)) {
        await update(id, profile);
        await setActive(id, true);
        return { created: false, updated: true };
    }

    const byName = await getByUsername(username);
    if (byName) {
        await replaceId(byName.id, id);
        await update(id, profile);
        await setActive(id, true);
        return { created: false, updated: true };
    }

    const [error] = await safe(add({ id, username, email, displayName }));
    if (error && error.reason !== MainError.ALREADY_EXISTS) throw error;
    if (error && error.reason === MainError.ALREADY_EXISTS) {
        await update(id, profile);
        await setActive(id, true);
        return { created: false, updated: true };
    }

    return { created: true, updated: false };
}

// OIDC sub is the username. Resolve the Cloudron id, then store the claims.
// updateProfile is set for an interactive login. A bearer or WebDAV request
// still resolves the id and marks the user active.
async function syncFromOidc({ username, email, displayName }, { updateProfile = false } = {}) {
    assert.strictEqual(typeof username, 'string');

    const profile = {
        username,
        email: email || '',
        displayName: displayName || username
    };

    let id = null;
    if (scim.isEnabled()) {
        const page = await scim.getUsers({ filter: scimUserNameFilter(username) });
        const directoryUser = page.resources.find((entry) => entry.username === username) || page.resources[0];
        if (!directoryUser?.id) throw new MainError(MainError.NOT_FOUND, 'directory user not found');
        id = directoryUser.id;
    }

    const existing = id ? await get(id) : null;
    const byName = await getByUsername(username);

    if (existing) {
        if (updateProfile) await update(existing.id, profile);
        if (!existing.active) await setActive(existing.id, true);
        return await get(existing.id);
    }

    if (byName) {
        if (id && byName.id !== id) await replaceId(byName.id, id);
        const currentId = id || byName.id;
        if (updateProfile) await update(currentId, profile);
        if (!byName.active) await setActive(currentId, true);
        return await get(currentId);
    }

    const userId = id || `local-${username}`;
    await add({ id: userId, ...profile });
    return await get(userId);
}

// Replace placeholder ids with Cloudron ids when the directory is available.
async function backfillIdsFromScim() {
    if (!scim.isEnabled()) return;

    for (const user of await list()) {
        const page = await scim.getUsers({ filter: scimUserNameFilter(user.username) });
        const match = page.resources.find((entry) => entry.username === user.username);
        if (!match?.id || match.id === user.id) continue;

        const taken = await get(match.id);
        if (taken) continue;

        await replaceId(user.id, match.id);
    }
}

export default {
    add,
    exists,
    get,
    getByUsername,
    getByAccessToken,
    list,
    update,
    setActive,
    replaceId,
    ensureUser,
    upsertFromScim,
    syncFromOidc,
    backfillIdsFromScim
};
