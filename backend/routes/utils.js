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

/** Validates the `ownerUsername` / `ownerGroupfolder` pair of a share or file drop body. Exactly one must be a non-empty string. */
export function parseOwner(body) {
    const ownerUsername = body.ownerUsername || null;
    const ownerGroupfolder = body.ownerGroupfolder || null;

    if (ownerUsername !== null && typeof ownerUsername !== 'string') return { error: 'ownerUsername must be a string' };
    if (ownerGroupfolder !== null && typeof ownerGroupfolder !== 'string') return { error: 'ownerGroupfolder must be a string' };
    if (!ownerUsername === !ownerGroupfolder) return { error: 'exactly one of ownerUsername or ownerGroupfolder is required' };

    return { ownerUsername, ownerGroupfolder };
}

/** Whether username may manage shares and file drops of the given storage: their own home, or a group folder where they are owner or editor. */
export async function canWriteOwner(username, ownerUsername, ownerGroupfolder) {
    if (ownerUsername) return ownerUsername === username;
    if (!ownerGroupfolder) return false;

    const groupFolder = await groupFolders.get(ownerGroupfolder);
    if (!groupFolder) return false;

    const role = await groupFolders.getRole(groupFolder, username);
    return role === groupFolders.ROLES.OWNER || role === groupFolders.ROLES.EDITOR;
}
