'use strict';

exports = module.exports = {
    isAuthenticated,
    isAdmin,
    setAdmin,
    tokenAuth,
    optionalAuth,
    profile,
    update,
    list
};

const assert = require('assert'),
    users = require('../users.js'),
    MainError = require('../mainerror.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

async function getUserFromSession(req) {
    if (!req.oidc?.isAuthenticated()) return null;
    if (!req.oidc.user || !req.oidc.user.sub) return null;

    try {
        return await users.get(req.oidc.user.sub);
    } catch (e) {
        if (e.reason === MainError.NOT_FOUND) return null;
        throw e;
    }
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

    try {
        return await users.getByAccessToken(accessToken);
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return null;
        throw error;
    }
}

async function isAuthenticated(req, res, next) {
    let user = await getUserFromToken(req);
    if (!user) user = await getUserFromSession(req);

    if (user) {
        // keep the internal database in-sync with the open id provider info
        if (user.displayName !== req.oidc.user.name || user.email !== req.oidc.user.email) {
            await users.update(user.username, { displayName: req.oidc.user.name, email: req.oidc.user.email });
            user.displayName = req.oidc.user.name;
            user.email = req.oidc.user.email;
        }

        req.user = user;
        return next();
    }

    try {
        console.log('New user found. Adding to database.', req.oidc.user.sub);

        await users.add({
            username: req.oidc.user.sub,
            password: '',
            email: req.oidc.user.email,
            displayName: req.oidc.user.name
        });
    } catch (e) {
        if (e.reason !== MainError.ALREADY_EXISTS) return next(new HttpError(500, 'internal error'));
    }

    user = await users.get(req.oidc.user.sub);

    // make first user admin
    const all = await users.list();
    if (all.length === 1) {
        console.log(`First user created. Making ${user.username} the admin.`);
        await users.setAdmin(user.username, true);
        user.admin = true;
    }

    req.user = user;

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

    try {
        await users.setAdmin(req.params.username, req.body.admin);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, {}));
}

// following middlewares have to check req.user if needed, like public share links
async function optionalAuth(req, res, next) {
    req.user = await getUserFromToken(req);
    if (!req.user) req.user = await getUserFromSession(req);
    next();
}

async function tokenAuth(req, res, next) {
    try {
        req.user = await getUserFromToken(req);
        if (!req.user) return next(new HttpError(401, 'Invalid Access Token'));
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next();
}

async function profile(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    // TODO remove private fields
    next(new HttpSuccess(200, req.user));
}

async function list(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    try {
        const result = await users.list();
        return next(new HttpSuccess(200, { users: result }));
    } catch (error) {
        return next(new HttpError(500, error));
    }
}

async function update(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    if (typeof req.body.password !== 'string' || !req.body.password) return next(new HttpError(400, 'password must be a non-empty string'));

    try {
        await users.setWebdavPassword(req.user.username, req.body.password);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, {}));
}
