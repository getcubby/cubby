'use strict';

exports = module.exports = {
    getConfig,
    mobileStart,
    codeToToken,
    callbackLandingFallback,
    assetLinks,
};

const crypto = require('crypto'),
    debug = require('debug')('cubby:routes:mobile'),
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    HttpError = require('connect-lastmile').HttpError,
    tokens = require('../tokens.js'),
    users = require('../users.js');

const PORT = process.env.PORT || 3000;
const APP_ORIGIN = process.env.APP_ORIGIN || `http://localhost:${PORT}`;
const USE_APP_LINKS = !!process.env.ANDROID_CERT_SHA256;
const REDIRECT_URI = USE_APP_LINKS ? `${APP_ORIGIN}/api/v1/mobile/callback` : 'org.getcubby://auth/callback';

const pendingStates = new Map(); // oidc state -> timestamp

function getConfig(req, res, next) {
    const config = {
        methods: [ 'oidc' ],
        oidc: { loginUrl: '/api/v1/mobile/start' }
    };

    next(new HttpSuccess(200, config));
}

function mobileStart(req, res) {
    const state = crypto.randomBytes(16).toString('hex');
    pendingStates.set(state, Date.now());
    for (const [s, ts] of pendingStates) {
        if ((Date.now() - ts) > 10 * 60 * 1000) pendingStates.delete(s); // state cleanup
    }

    debug(`mobileStart: auth starting with redirect_uri: ${REDIRECT_URI} (USE_APP_LINKS: ${USE_APP_LINKS})`);

    const authUrl = new URL(`${process.env.OIDC_ISSUER_BASE_URL}/auth`);
    authUrl.searchParams.set('client_id', process.env.OIDC_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('prompt', 'login'); // on mobile, the session is cached in browser. this forces IDP to prompt

    res.redirect(authUrl.toString());
}

async function exchangeCodeWithIdp(code, redirectUri) {
    const tokenUrl = new URL(process.env.CLOUDRON_OIDC_TOKEN_ENDPOINT);
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('client_id', process.env.OIDC_CLIENT_ID);
    params.append('client_secret', process.env.CLOUDRON_OIDC_CLIENT_SECRET);

    const response = await fetch(tokenUrl.toString(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
    });

    if (!response.ok) {
        const errorText = await response.text();
        debug(`exchangeCodeWithIdp: ${errorText}`);
        throw new Error('Failed to exchange code for token');
    }

    return response.json();
}

async function getOidcProfile(accessToken) {
    const userInfoUrl = new URL(process.env.CLOUDRON_OIDC_PROFILE_ENDPOINT);
    const response = await fetch(userInfoUrl.toString(), {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) throw new Error('Failed to get user info');
    return response.json();
}

async function codeToToken(req, res, next) {
    const { code, state } = req.body;
    if (!code) return next(new HttpError(400, 'code is required'));
    if (!state) return next(new HttpError(400, 'state is required'));

    if (!pendingStates.has(state)) return next(new HttpError(400, 'invalid or expired state'));
    pendingStates.delete(state);

    try {
        const idpTokens = await exchangeCodeWithIdp(code, REDIRECT_URI);
        const profile = await getOidcProfile(idpTokens.access_token);
        const user = await users.ensureUser({ username: profile.sub, password: '', email: profile.email, displayName: profile.name });
        const apiToken = await tokens.add(user.username);

        next(new HttpSuccess(200, {
            token: apiToken,
            user: {
                username: user.username,
                email: user.email,
                displayName: user.displayName,
                admin: user.admin
            }
        }));
    } catch (error) {
        console.error('codeToToken error:', error);
        next(new HttpError(401, error.message || 'Authentication failed'));
    }
}

// Serves landing page for when app is not installed (App Link should intercept this) . this can happen if someone manually
// started the auth flow
function callbackLandingFallback(req, res) {
    res.send('Please install the mobile app - https://play.google.com/store/apps/details?id=org.getcubby.app');
}

function assetLinks(req, res) {
    const sha256Fingerprints = process.env.ANDROID_CERT_SHA256 ? process.env.ANDROID_CERT_SHA256.split(',').map(s => s.trim()) : [];

    res.json([{
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
            namespace: 'android_app',
            package_name: 'org.getcubby.app',
            sha256_cert_fingerprints: sha256Fingerprints
        }
    }]);
}

