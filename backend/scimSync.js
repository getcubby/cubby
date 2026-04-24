import users from './users.js';

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
 * Fetch all users from SCIM endpoint, handling pagination.
 * @returns {Promise<Array>}
 */
async function fetchScimUsers() {
    const allUsers = [];
    let startIndex = 1;
    const count = 100;

    while (true) {
        const url = new URL('/v2/Users', SCIM_ORIGIN);
        url.searchParams.set('startIndex', String(startIndex));
        url.searchParams.set('count', String(count));

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

        let res;
        try {
            res = await fetch(url.toString(), {
                signal: ctrl.signal,
                headers: {
                    Authorization: `Bearer ${SCIM_TOKEN}`,
                    Accept: 'application/scim+json, application/json'
                }
            });
        } finally {
            clearTimeout(timer);
        }

        if (!res.ok) {
            throw new Error(`SCIM API returned HTTP ${res.status}`);
        }

        const data = await res.json();
        const resources = data.Resources || [];
        allUsers.push(...resources);

        const totalResults = data.totalResults || 0;
        const itemsPerPage = data.itemsPerPage || resources.length;

        if (startIndex + itemsPerPage > totalResults || resources.length === 0) {
            break;
        }
        startIndex += itemsPerPage;
    }

    return allUsers;
}

/**
 * @returns {Promise<{ created: number, updated: number, skipped: number }>}
 */
export async function syncScimUsers() {
    if (!isScimEnabled()) {
        return { created: 0, updated: 0, skipped: 0 };
    }

    const scimUsers = await fetchScimUsers();
    let created = 0;
    let updated = 0;
    let skipped = 0;

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

        const displayName = getDisplayName(user);
        const email = getPrimaryEmail(user.emails) || userName;

        const result = await users.upsertFromScim(userName, { displayName, email });
        if (result.created) {
            created += 1;
        } else if (result.updated) {
            updated += 1;
        }
    }

    return { created, updated, skipped };
}

export async function runScimSyncTick() {
    if (!isScimEnabled()) return;

    try {
        const stats = await syncScimUsers();
        if (stats.created > 0 || stats.updated > 0) {
            console.log(`SCIM sync: created=${stats.created} updated=${stats.updated} skipped=${stats.skipped}`);
        }
    } catch (err) {
        console.error('SCIM sync failed:', err.message || err);
    }
}

export { isScimEnabled, SYNC_INTERVAL_MS };
