import crypto from 'crypto';
import debug from 'debug';
import { HttpSuccess, HttpError } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';
import mobiletokens from '../mobiletokens.js';
import users from '../users.js';
import { authorizationUrl, exchangeCode } from '../mobileoidc.js';

const debugLog = debug('cubby:routes:mobile');

const PACKAGE_NAME = 'io.cloudron.cubby';
const PORT = process.env.PORT || 3000;
const APP_ORIGIN = process.env.APP_ORIGIN || `http://localhost:${PORT}`;
const USE_APP_LINKS = !!process.env.ANDROID_CERT_SHA256;
const CUSTOM_SCHEME_REDIRECT = 'io.cloudron.cubby://auth/callback';

const pendingStates = new Map(); // oidc state -> timestamp

function redirectUri() {
    return USE_APP_LINKS ? `${APP_ORIGIN}/api/v1/mobile/callback` : CUSTOM_SCHEME_REDIRECT;
}

function rememberState(state) {
    pendingStates.set(state, Date.now());
    for (const [saved, ts] of pendingStates) {
        if ((Date.now() - ts) > 10 * 60 * 1000) pendingStates.delete(saved); // state cleanup
    }
}

function getConfig(req, res, next) {
    next(new HttpSuccess(200, {
        methods: [ 'oidc' ],
        oidc: { loginUrl: '/api/v1/mobile/start' }
    }));
}

async function mobileStart(req, res) {
    const state = crypto.randomBytes(16).toString('hex');
    rememberState(state);

    debugLog(`mobileStart: auth starting with redirect_uri: ${redirectUri()} (USE_APP_LINKS: ${USE_APP_LINKS})`);

    const url = await authorizationUrl({ redirectUri: redirectUri(), state });
    res.redirect(url);
}

async function codeToToken(req, res, next) {
    const { code, state } = req.body;
    if (!code) return next(new HttpError(400, 'code is required'));
    if (!state) return next(new HttpError(400, 'state is required'));

    if (!pendingStates.has(state)) return next(new HttpError(400, 'invalid or expired state'));
    pendingStates.delete(state);

    const [exchangeError, exchanged] = await safe(exchangeCode({ code, redirectUri: redirectUri() }));
    if (exchangeError) {
        console.error('codeToToken error:', exchangeError);
        return next(new HttpError(401, 'Authentication failed'));
    }

    const profile = exchanged.profile || {};
    const username = profile.sub;
    if (!username) return next(new HttpError(401, 'Authentication failed'));

    const displayName = profile.name || username;
    const email = profile.email || '';

    const [userError, user] = await safe(users.ensureUser({ username, email, displayName }));
    if (userError) {
        console.error('codeToToken error:', userError);
        return next(new HttpError(401, 'Authentication failed'));
    }

    const [addTokenError, apiToken] = await safe(mobiletokens.add({
        username: user.username,
        accessToken: exchanged.tokens.access_token,
        refreshToken: exchanged.tokens.refresh_token,
        expiresIn: exchanged.tokens.expires_in
    }));
    if (addTokenError) {
        console.error('codeToToken error:', addTokenError);
        return next(new HttpError(401, 'Authentication failed'));
    }

    next(new HttpSuccess(200, {
        token: apiToken,
        user: {
            username: user.username,
            email: user.email,
            displayName: user.displayName
        }
    }));
}

// Serves landing page for when app is not installed (App Link should intercept this) . this can happen if someone manually
// started the auth flow
function callbackLandingFallback(req, res) {
    res.send('Please install the mobile app - https://play.google.com/store/apps/details?id=io.cloudron.cubby');
}

function assetLinks(req, res) {
    const sha256Fingerprints = process.env.ANDROID_CERT_SHA256 ? process.env.ANDROID_CERT_SHA256.split(',').map(s => s.trim()) : [];

    res.json([{
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
            namespace: 'android_app',
            package_name: PACKAGE_NAME,
            sha256_cert_fingerprints: sha256Fingerprints
        }
    }]);
}

export default {
    getConfig,
    mobileStart,
    codeToToken,
    callbackLandingFallback,
    assetLinks
};
