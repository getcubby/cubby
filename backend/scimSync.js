import users from './users.js';
import groups from './groups.js';
import recoll from './recoll.js';
import safe from '@cloudron/safetydance';

const SCIM_ORIGIN = process.env.CLOUDRON_SCIM_ORIGIN || '';
const SCIM_TOKEN = process.env.CLOUDRON_SCIM_TOKEN || '';
const FETCH_TIMEOUT_MS = 30_000;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

function isScimEnabled() {
    return !!(SCIM_ORIGIN && SCIM_TOKEN);
}

function getPrimaryEmail(emails) {
    if (!Array.isArray(emails) || emails.length === 0) return null;
    const primary = emails.find((e) => e && e.primary);
    if (primary && primary.value) return String(primary.value).trim();
    if (emails[0] && emails[0].value) return String(emails[0].value).trim();
    return null;
}

function getDisplayName(user) {
    if (user.name && user.name.formatted) return String(user.name.formatted).trim();
    if (user.displayName) return String(user.displayName).trim();
    if (user.name && user.name.givenName && user.name.familyName) {
        return `${user.name.givenName} ${user.name.familyName}`.trim();
    }
    if (user.userName) return String(user.userName).split('@')[0];
    return 'User';
}

/**
 * Fetch all resources from a SCIM endpoint, handling pagination.
 * @param {string} endpoint - e.g. '/v2/Users' or '/v2/Groups'
 * @returns {Promise<Array>}
 */
async function fetchScimResources(endpoint) {
    const allResources = [];
    let startIndex = 1;
    const count = 100;

    while (true) {
        const url = new URL(endpoint, SCIM_ORIGIN);
        url.searchParams.set('startIndex', String(startIndex));
        url.searchParams.set('count', String(count));

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

        const [fetchError, res] = await safe(fetch(url.toString(), {
            signal: ctrl.signal,
            headers: {
                Authorization: `Bearer ${SCIM_TOKEN}`,
                Accept: 'application/scim+json, application/json'
            }
        }));
        clearTimeout(timer);

        if (fetchError) throw fetchError;

        if (!res.ok) {
            throw new Error(`SCIM API returned HTTP ${res.status}`);
        }

        const data = await res.json();
        const resources = data.Resources || [];
        allResources.push(...resources);

        const totalResults = data.totalResults || 0;
        const itemsPerPage = data.itemsPerPage || resources.length;

        if (startIndex + itemsPerPage > totalResults || resources.length === 0) {
            break;
        }
        startIndex += itemsPerPage;
    }

    return allResources;
}

async function fetchScimUsers() {
    return await fetchScimResources('/v2/Users');
}

async function fetchScimGroups() {
    return await fetchScimResources('/v2/Groups');
}

/**
 * @returns {Promise<{ created: number, updated: number, skipped: number, idToUsername: Map<string, string> }>}
 */
export async function syncScimUsers() {
    if (!isScimEnabled()) {
        return { created: 0, updated: 0, skipped: 0, idToUsername: new Map() };
    }

    const scimUsers = await fetchScimUsers();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const idToUsername = new Map();

    for (const user of scimUsers) {
        const userName = user.userName ? String(user.userName).trim() : '';
        if (!userName) {
            skipped += 1;
            continue;
        }

        if (user.active === false) {
            skipped += 1;
            continue;
        }

        if (user.id) idToUsername.set(String(user.id), userName);

        const displayName = getDisplayName(user);
        const email = getPrimaryEmail(user.emails) || userName;

        const result = await users.upsertFromScim(userName, { displayName, email });
        if (result.created) {
            created += 1;
        } else if (result.updated) {
            updated += 1;
        }
    }

    return { created, updated, skipped, idToUsername };
}

/**
 * @param {Map<string, string>} idToUsername
 * @returns {Promise<{ created: number, updated: number, removed: number, skipped: number }>}
 */
export async function syncScimGroups(idToUsername) {
    if (!isScimEnabled()) {
        return { created: 0, updated: 0, removed: 0, skipped: 0 };
    }

    const scimGroups = await fetchScimGroups();
    let created = 0;
    let updated = 0;
    let removed = 0;
    let skipped = 0;
    const seenIds = new Set();

    for (const group of scimGroups) {
        const id = group.id ? String(group.id).trim() : '';
        if (!id) {
            skipped += 1;
            continue;
        }

        seenIds.add(id);

        const name = group.displayName ? String(group.displayName).trim() : id;
        const memberUsernames = new Set();
        for (const member of (group.members || [])) {
            const userId = member && member.value ? String(member.value) : '';
            const username = idToUsername.get(userId);
            if (username) memberUsernames.add(username);
        }

        const result = await groups.upsertFromScim(id, name, Array.from(memberUsernames));
        if (result.created) {
            created += 1;
        } else if (result.updated) {
            updated += 1;
        }
    }

    // remove scim groups that no longer exist upstream
    for (const group of await groups.list()) {
        if (group.source !== groups.SOURCES.SCIM) continue;
        if (seenIds.has(group.id)) continue;

        await groups.remove(group.id);
        removed += 1;
    }

    return { created, updated, removed, skipped };
}

export async function runScimSyncTick() {
    if (!isScimEnabled()) return;

    const [usersError, userStats] = await safe(syncScimUsers());
    if (usersError) {
        console.error('SCIM sync failed:', usersError.message || usersError);
        return;
    }

    if (userStats.created > 0 || userStats.updated > 0) {
        console.log(`SCIM sync: users created=${userStats.created} updated=${userStats.updated} skipped=${userStats.skipped}`);
    }

    const [groupsError, groupStats] = await safe(syncScimGroups(userStats.idToUsername));
    if (groupsError) {
        console.error('SCIM group sync failed:', groupsError.message || groupsError);
        return;
    }

    if (groupStats.created > 0 || groupStats.updated > 0 || groupStats.removed > 0) {
        console.log(`SCIM sync: groups created=${groupStats.created} updated=${groupStats.updated} removed=${groupStats.removed} skipped=${groupStats.skipped}`);

        // group membership affects which groupfolders a user can access and search
        recoll.index().catch((err) => console.error('SCIM sync reindex failed:', err));
    }
}

export { isScimEnabled, SYNC_INTERVAL_MS };
