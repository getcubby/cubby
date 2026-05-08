import assert from 'assert';
import users from '../users.js';
import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';

async function getUserFromSession(req) {
    const sessionUser = req.session?.user;
    if (!sessionUser?.username) return null;

    let user = await users.get(sessionUser.username);
    if (!user) {
        user = await users.ensureUser({
            username: sessionUser.username,
            email: sessionUser.email ?? '',
            displayName: sessionUser.displayName ?? sessionUser.name ?? sessionUser.username
        });
    }
    return user;
}

async function getUserFromToken(req) {
    let accessToken = req.query.access_token || req.body?.accessToken || '';
    if (req.headers?.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length == 2) {
            const [scheme, credentials] = parts;

            if (/^Bearer$/i.test(scheme)) accessToken = credentials;
        }
    }

    if (!accessToken) return null;

    return await users.getByAccessToken(accessToken);
}

async function isAuthenticated(req, res, next) {
    let user = await getUserFromToken(req);
    if (!user) user = await getUserFromSession(req);

    if (!user) {
        const sessionUser = req.session?.user;
        if (!sessionUser?.username) return next(new HttpError(401, 'Unauthorized'));

        req.user = await users.ensureUser({
            username: sessionUser.username,
            email: sessionUser.email ?? '',
            displayName: sessionUser.displayName ?? sessionUser.name ?? sessionUser.username
        });
    } else {
        // keep the internal database in sync with the session/OIDC provider info
        const sessionUser = req.session?.user;
        if (sessionUser && (user.displayName !== (sessionUser.displayName ?? sessionUser.name) || user.email !== (sessionUser.email ?? ''))) {
            await users.update(user.username, {
                displayName: sessionUser.displayName ?? sessionUser.name ?? user.displayName,
                email: sessionUser.email ?? user.email
            });
            user.displayName = sessionUser.displayName ?? sessionUser.name ?? user.displayName;
            user.email = sessionUser.email ?? user.email;
        }
        req.user = user;
    }

    next();
}

function isAdmin(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    if (!req.user.admin) return next(new HttpError(403, 'user is not an admin'));

    next();
}

async function setAdmin(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert.strictEqual(typeof req.params.username, 'string');
    assert.strictEqual(req.user.admin, true);

    if (typeof req.body.admin !== 'boolean') return next(new HttpError(400, 'admin must be a boolean'));
    if (!users.exists(req.params.username)) return next(new HttpError(409, 'user does not exist'));
    if (req.user.username === req.params.username) return next(new HttpError(403, 'cannot set admin status on own user'));

    const [error] = await safe(users.setAdmin(req.params.username, req.body.admin));
    if (error) return next(new HttpError(500, error));

    next(new HttpSuccess(200, {}));
}

// following middlewares have to check req.user if needed, like public share links
async function optionalAuth(req, res, next) {
    req.user = await getUserFromToken(req);
    if (!req.user) req.user = await getUserFromSession(req);
    next();
}

async function tokenAuth(req, res, next) {
    const [error, user] = await safe(getUserFromToken(req));
    if (error) return next(new HttpError(500, error));
    if (!user) return next(new HttpError(401, 'Invalid Access Token'));

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
    if (error) return next(new HttpError(500, error));

    return next(new HttpSuccess(200, { users: result }));
}

export default {
    isAuthenticated,
    isAdmin,
    setAdmin,
    tokenAuth,
    optionalAuth,
    profile,
    list
};
