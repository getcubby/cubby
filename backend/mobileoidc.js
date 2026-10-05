let metadata = null;

function issuer() {
    return (process.env.CLOUDRON_OIDC_ISSUER || process.env.OIDC_ISSUER_BASE_URL || '').replace(/\/$/, '');
}

function clientId() {
    return process.env.CLOUDRON_OIDC_CLIENT_ID || process.env.OIDC_CLIENT_ID || '';
}

function clientSecret() {
    return process.env.CLOUDRON_OIDC_CLIENT_SECRET || process.env.OIDC_CLIENT_SECRET || '';
}

export async function discover() {
    if (metadata) return metadata;

    const origin = issuer();
    if (!origin) throw new Error('OIDC issuer is not configured');

    const response = await fetch(`${origin}/.well-known/openid-configuration`);
    if (!response.ok) throw new Error('Failed to load OIDC configuration');

    metadata = await response.json();
    return metadata;
}

export function resetDiscovery() {
    metadata = null;
}

export async function authorizationUrl({ redirectUri, state }) {
    const config = await discover();
    const url = new URL(config.authorization_endpoint);
    url.searchParams.set('client_id', clientId());
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', state);
    // The IdP session is cached in the browser. Force a prompt so switching accounts works.
    url.searchParams.set('prompt', 'login');
    return url.toString();
}

async function tokenRequest(params) {
    const config = await discover();
    const body = new URLSearchParams(params);
    body.set('client_id', clientId());
    body.set('client_secret', clientSecret());

    const response = await fetch(config.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });

    if (!response.ok) throw new Error('OIDC token request failed');

    return response.json();
}

export async function exchangeCode({ code, redirectUri }) {
    const tokens = await tokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
    });

    const config = await discover();
    const profileResponse = await fetch(config.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    if (!profileResponse.ok) throw new Error('Failed to load OIDC profile');

    const profile = await profileResponse.json();
    return { tokens, profile };
}

export async function refreshAccessToken(refreshToken) {
    const tokens = await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
    });
    return {
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
        refresh_token: tokens.refresh_token
    };
}
