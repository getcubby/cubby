import mobiletokens from './mobiletokens.js';
import safe from '@cloudron/safetydance';
import { refreshAccessToken } from './mobileoidc.js';

const refreshLocks = new Map();

// Rewrites a mobile API token into the OIDC access token tegel introspects.
// Unknown bearer values are left alone so a raw OIDC access token or a WOPI token still works.
export async function resolveMobileToken(req, res, next) {
    const header = req.get('Authorization');
    if (!header || !header.startsWith('Bearer ')) return next();

    const opaque = header.slice('Bearer '.length);
    const [lookupError, row] = await safe(mobiletokens.get(opaque));
    if (lookupError) {
        console.error('resolveMobileToken: failed to look up mobile token:', lookupError.message);
        return next();
    }
    if (!row) return next();

    const now = Math.floor(Date.now() / 1000);
    if (row.access_token_expires_at == null || now < row.access_token_expires_at - 60) {
        req.headers.authorization = `Bearer ${row.access_token}`;
        return next();
    }

    if (!row.refresh_token) {
        await safe(mobiletokens.remove(opaque));
        return res.status(401).json({ error: 'Session expired' });
    }

    if (!refreshLocks.has(opaque)) {
        refreshLocks.set(opaque, refreshAccessToken(row.refresh_token));
    }

    try {
        const tokens = await refreshLocks.get(opaque);
        refreshLocks.delete(opaque);
        await safe(mobiletokens.updateTokens(opaque, {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresIn: tokens.expires_in
        }));
        req.headers.authorization = `Bearer ${tokens.access_token}`;
        return next();
    } catch (error) {
        refreshLocks.delete(opaque);
        console.error('Mobile token refresh failed:', error.message);
        return res.status(401).json({ error: 'Session expired' });
    }
}
