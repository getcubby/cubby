'use strict';

exports = module.exports = {
    getConfig,
    mobileStart,
    callbackLandingFallback,
    assetLinks
};

const crypto = require('crypto'),
    debug = require('debug')('cubby:routes:mobile'),
    HttpSuccess = require('connect-lastmile').HttpSuccess;

const PORT = process.env.PORT || 3000;
const APP_ORIGIN = process.env.APP_ORIGIN || `http://localhost:${PORT}`;
const USE_APP_LINKS = !!process.env.ANDROID_CERT_SHA256;

function getConfig(req, res, next) {
    const config = {
        methods: [ 'oidc' ],
        oidc: { loginUrl: '/api/v1/mobile/start' }
    };

    next(new HttpSuccess(200, config));
}

function mobileStart(req, res) {
    // Use App Links when ANDROID_CERT_SHA256 is configured, otherwise use custom scheme
    const redirectUri = USE_APP_LINKS ? `${APP_ORIGIN}/api/v1/mobile/callback` : 'org.getcubby://auth/callback';

    const state = crypto.randomBytes(16).toString('hex');

    debug(`mobileStart: auth starting with redirect_uri: ${redirectUri} (USE_APP_LINKS: ${USE_APP_LINKS})`);

    const authUrl = new URL(`${process.env.OIDC_ISSUER_BASE_URL}/auth`);
    authUrl.searchParams.set('client_id', process.env.OIDC_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('state', state);

    res.redirect(authUrl.toString());
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

