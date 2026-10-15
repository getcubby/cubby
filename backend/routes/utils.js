import groupFolders from '../groupfolders.js';

/** `expiresAt` is always milliseconds since Unix epoch (finite number), or omitted / null / 0 for no expiration. */
export function parseExpiresAtMs(raw) {
    if (raw === undefined || raw === null || raw === 0) return { expiresAtMs: null };

    if (typeof raw !== 'number' || !Number.isFinite(raw)) return { error: 'expiresAt must be a finite number (milliseconds) or omitted' };

    if (raw < 0) return { error: 'expiresAt must be non-negative' };

    const now = Date.now();
    if (raw <= now) return { error: 'expiresAt must be in the future' };

    const max = now + 10 * 365 * 24 * 60 * 60 * 1000;
    if (raw > max) return { error: 'expiresAt is too far in the future' };

    return { expiresAtMs: raw };
}

/** Validates the `ownerUserId` / `ownerGroupfolder` pair of a share or file drop body. Exactly one must be a non-empty string. */
export function parseOwner(body) {
    const ownerUserId = body.ownerUserId || null;
    const ownerGroupfolder = body.ownerGroupfolder || null;

    if (ownerUserId !== null && typeof ownerUserId !== 'string') return { error: 'ownerUserId must be a string' };
    if (ownerGroupfolder !== null && typeof ownerGroupfolder !== 'string') return { error: 'ownerGroupfolder must be a string' };
    if (!ownerUserId === !ownerGroupfolder) return { error: 'exactly one of ownerUserId or ownerGroupfolder is required' };

    return { ownerUserId, ownerGroupfolder };
}

/** Whether userId may read files of the given storage: their own home, or a group folder they are part of. */
export async function canReadOwner(userId, ownerUserId, ownerGroupfolder) {
    if (ownerUserId) return ownerUserId === userId;
    if (!ownerGroupfolder) return false;

    const groupFolder = await groupFolders.get(ownerGroupfolder);
    if (!groupFolder) return false;

    return await groupFolders.isPartOf(groupFolder, userId);
}

/** Whether userId may manage shares and file drops of the given storage: their own home, or a group folder where they are owner or editor. */
export async function canWriteOwner(userId, ownerUserId, ownerGroupfolder) {
    if (ownerUserId) return ownerUserId === userId;
    if (!ownerGroupfolder) return false;

    const groupFolder = await groupFolders.get(ownerGroupfolder);
    if (!groupFolder) return false;

    const role = await groupFolders.getRole(groupFolder, userId);
    return role === groupFolders.ROLES.OWNER || role === groupFolders.ROLES.EDITOR;
}
