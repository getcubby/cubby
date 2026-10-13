import { HttpSuccess } from '@cloudron/connect-lastmile';

const CUSTOM_SCHEME_REDIRECT = 'io.cloudron.cubby://auth/callback';

function issuer() {
    return (process.env.CLOUDRON_OIDC_ISSUER || process.env.OIDC_ISSUER_BASE_URL || '').replace(/\/$/, '');
}

function getConfig(req, res, next) {
    next(new HttpSuccess(200, {
        methods: [ 'oidc' ],
        oidc: {
            issuer: issuer(),
            clientId: process.env.CLOUDRON_OIDC_PUBLIC_CLIENT_ID || '',
            redirectUri: CUSTOM_SCHEME_REDIRECT
        }
    }));
}

export default {
    getConfig
};
