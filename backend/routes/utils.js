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
