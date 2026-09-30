import assert from 'assert';
import users from '../users.js';
import MainError from '../mainerror.js';
import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';
import * as tegel from '@cloudron/tegel';

const requireOidcAuth = tegel.requireAuth();
const optionalOidcAuth = tegel.optionalAuth();

function extractAccessToken(req) {
    let accessToken = req.query.access_token || req.body?.accessToken || '';
    if (req.headers?.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length == 2) {
            const [scheme, credentials] = parts;

            if (/^Bearer$/i.test(scheme)) accessToken = credentials;
        }
    }

    return accessToken;
}

// cubby's own api tokens (mobile app and WOPI)
async function getUserFromLocalToken(req) {
    const accessToken = extractAccessToken(req);
    if (!accessToken) return null;

    return await users.getByAccessToken(accessToken);
}

function runMiddleware(middleware, req, res) {
    return new Promise((resolve) => middleware(req, res, resolve));
}

// maps req.user set by tegel (session or OIDC bearer token) to the database user
async function getDatabaseUser(req) {
    const oidcUser = req.user;
    const displayName = oidcUser.displayName ?? oidcUser.name ?? oidcUser.username;
    const email = oidcUser.email ?? '';

    const user = await users.get(oidcUser.username);
    if (!user) return await users.ensureUser({ username: oidcUser.username, email, displayName });

    // keep the internal database in sync with the session info. bearer token introspection may not have these claims
    const fromSession = req.session?.user === oidcUser;
    if (fromSession && (user.displayName !== displayName || user.email !== email)) {
        await users.update(user.username, { displayName, email });
        user.displayName = displayName;
        user.email = email;
    }

    return user;
}

async function isAuthenticated(req, res, next) {
    const [tokenError, tokenUser] = await safe(getUserFromLocalToken(req));
    if (tokenError) return next(MainError.toHttpError(tokenError));
    if (tokenUser) {
        req.user = tokenUser;
        return next();
    }

    const authError = await runMiddleware(requireOidcAuth, req, res);
    if (authError) return next(authError);
    if (!req.user?.username) return next(new HttpError(401, 'Unauthorized'));

    const [error, user] = await safe(getDatabaseUser(req));
    if (error) return next(MainError.toHttpError(error));

    req.user = user;
    next();
}

// following middlewares have to check req.user if needed, like public share links
async function optionalAuth(req, res, next) {
    const [tokenError, tokenUser] = await safe(getUserFromLocalToken(req));
    if (tokenError) return next(MainError.toHttpError(tokenError));
    if (tokenUser) {
        req.user = tokenUser;
        return next();
    }

    await runMiddleware(optionalOidcAuth, req, res);
    if (!req.user?.username) {
        req.user = null;
        return next();
    }

    const [error, user] = await safe(getDatabaseUser(req));
    if (error) {
        console.error('optionalAuth: failed to get database user', error);
        req.user = null;
        return next();
    }

    req.user = user;
    next();
}

async function profile(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    // TODO remove private fields
    next(new HttpSuccess(200, req.user));
}

async function list(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const [error, result] = await safe(users.list());
    if (error) return next(MainError.toHttpError(error));

    return next(new HttpSuccess(200, { users: result }));
}

export default {
    isAuthenticated,
    optionalAuth,
    profile,
    list
};
