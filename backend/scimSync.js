import users from './users.js';
import groups from './groups.js';
import recoll from './recoll.js';
import { scim } from '@cloudron/tegel';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

function isScimEnabled() {
    return scim.isEnabled();
}

/**
 * @param {Array<{ id?: string, username: string, displayName?: string, email?: string, active?: boolean }>} scimUsers
 * @returns {Promise<{ created: number, updated: number, deactivated: number, skipped: number, seenUserIds: Set<string> }>}
 */
export async function reconcileScimUsers(scimUsers) {
    let created = 0;
    let updated = 0;
    let deactivated = 0;
    let skipped = 0;
    const seenUserIds = new Set();

    // an empty fetch is not a directory listing; leave every active flag alone
    if (scimUsers.length === 0) {
        return { created, updated, deactivated, skipped, seenUserIds };
    }

    for (const user of scimUsers) {
        const userName = user.username;
        const userId = user.id ? String(user.id) : '';
        if (!userName || !userId) {
            skipped += 1;
            continue;
        }

        // absent and inactive directory users stay out of group membership maps
        if (user.active === false) {
            skipped += 1;
            continue;
        }

        seenUserIds.add(userId);

        const result = await users.upsertFromScim(userId, { username: userName, displayName: user.displayName, email: user.email || userName });
        if (result.created) {
            created += 1;
        } else if (result.updated) {
            updated += 1;
        }
    }

    for (const local of await users.list()) {
        if (seenUserIds.has(local.id)) continue;
        if (!local.active) continue;

        await users.setActive(local.id, false);
        deactivated += 1;
    }

    return { created, updated, deactivated, skipped, seenUserIds };
}

export async function saveDirectoryUsers(records) {
    for (const record of records || []) {
        if (!record?.id || !record.username) continue;

        await users.upsertFromScim(record.id, {
            username: record.username,
            email: record.email || '',
            displayName: record.displayName || record.username,
            active: record.active !== false
        });
    }
}

export async function deactivateDirectoryUsers(ids) {
    for (const id of ids || []) {
        const user = await users.get(id);
        if (!user || !user.active) continue;

        await users.setActive(id, false);
    }
}

/**
 * @param {Array<{ id: string, name?: string, memberIds: string[] }>} scimGroups
 * @param {Set<string>} seenUserIds
 * @returns {Promise<{ created: number, updated: number, deactivated: number, skipped: number }>}
 */
export async function reconcileScimGroups(scimGroups, seenUserIds) {
    let created = 0;
    let updated = 0;
    let deactivated = 0;
    let skipped = 0;
    const seenIds = new Set();

    // an empty fetch is not a directory listing; leave every active flag alone
    if (scimGroups.length === 0) {
        return { created, updated, deactivated, skipped };
    }

    for (const group of scimGroups) {
        const id = group.id;
        if (!id) {
            skipped += 1;
            continue;
        }

        seenIds.add(id);

        const name = group.name || id;
        const memberUserIds = [];
        for (const userId of group.memberIds) {
            if (seenUserIds.has(userId)) memberUserIds.push(userId);
        }

        const result = await groups.upsertFromScim(id, name, memberUserIds);
        if (result.created) {
            created += 1;
        } else if (result.updated) {
            updated += 1;
        }
    }

    // keep the row and its memberships; hide the group from assign lists
    for (const group of await groups.list()) {
        if (seenIds.has(group.id)) continue;
        if (!group.active) continue;

        await groups.setActive(group.id, false);
        deactivated += 1;
    }

    return { created, updated, deactivated, skipped };
}

export async function saveDirectoryGroups(upserts) {
    const seenUserIds = new Set((await users.list()).filter((user) => user.active).map((user) => user.id));
    const stats = await reconcileScimGroups(upserts, seenUserIds);

    if (stats.created > 0 || stats.updated > 0) {
        // group membership affects which groupfolders a user can access and search
        recoll.index().catch((err) => console.error('SCIM sync reindex failed:', err));
    }
}

export { isScimEnabled, SYNC_INTERVAL_MS };
