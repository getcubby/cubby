'use strict';

exports = module.exports = {
    isAuthenticated,
    isAdmin,
    setAdmin,
    tokenAuth,
    optionalSessionAuth,
    profile,
    update,
    list
};

var assert = require('assert'),
    users = require('../users.js'),
    MainError = require('../mainerror.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

async function isAuthenticated(req, res, next) {
    if (!req.oidc.isAuthenticated()) return next(new HttpError(401, 'Unauthorized'));

    let user;
    try {
        user = await users.get(req.oidc.user.sub);
    } catch (e) {
        if (e.reason !== MainError.NOT_FOUND) return next(new HttpError(500, 'internal error'));
    }

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
async function optionalSessionAuth(req, res, next) {
    if (!req.oidc.user || !req.oidc.user.sub) {
        req.user = null;
        return next();
    }

    try {
        req.user = await users.get(req.oidc.user.sub);
        if (!req.user) return next(new HttpError(401, 'Invalid login session'));
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next();
}

async function tokenAuth(req, res, next) {
    var accessToken = req.query.access_token || req.body.accessToken || '';

    try {
        req.user = await users.getByAccessToken(accessToken);
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
