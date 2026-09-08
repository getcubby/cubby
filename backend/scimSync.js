import users from './users.js';
import groups from './groups.js';
import recoll from './recoll.js';
import { scim } from '@cloudron/tegel';
import safe from '@cloudron/safetydance';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

function isScimEnabled() {
    return scim.isEnabled();
}

/**
 * @returns {Promise<{ created: number, updated: number, skipped: number, idToUsername: Map<string, string> }>}
 */
export async function syncScimUsers() {
    if (!scim.isEnabled()) {
        return { created: 0, updated: 0, skipped: 0, idToUsername: new Map() };
    }

    const scimUsers = await scim.getAllUsers();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const idToUsername = new Map();

    for (const user of scimUsers) {
        const userName = user.username;
        if (!userName) {
            skipped += 1;
            continue;
        }

        if (user.active === false) {
            skipped += 1;
            continue;
        }

        if (user.id) idToUsername.set(String(user.id), userName);

        const result = await users.upsertFromScim(userName, { displayName: user.displayName, email: user.email || userName });
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
    if (!scim.isEnabled()) {
        return { created: 0, updated: 0, removed: 0, skipped: 0 };
    }

    const scimGroups = await scim.getAllGroups();
    let created = 0;
    let updated = 0;
    let removed = 0;
    let skipped = 0;
    const seenIds = new Set();

    for (const group of scimGroups) {
        const id = group.id;
        if (!id) {
            skipped += 1;
            continue;
        }

        seenIds.add(id);

        const name = group.name || id;
        const memberUsernames = new Set();
        for (const userId of group.memberIds) {
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
    if (!scim.isEnabled()) return;

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
