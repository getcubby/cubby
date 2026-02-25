import users from '../users.js';
import constants from '../constants.js';
import webdavServer from 'webdav-server';

const webdav = webdavServer.v2;
const PrivilegeManager = webdavServer.v2.PrivilegeManager;
const webdavErrors = webdavServer.v2.Errors;

class WebdavPrivilegeManager extends PrivilegeManager
{
    constructor() {
        super();
    }

    _can(fullPath, user, resource, privilege, callback) {
        // currently we only check for prefixes /webdav/ access is never allowed
        if (resource.context.requested.uri.indexOf('/' + user.username) !== 0) return callback(null, false);

        callback(null, true);
    }
}

// This implements the required interface only for the Basic Authentication for webdav-server
function WebdavUserManager() {
    this._authCache = {
        // key: TimeToDie as ms
    };
}

WebdavUserManager.prototype.getDefaultUser = function (callback) {
    // this is only a dummy user, since we always require authentication
    var user = {
        username: 'DefaultUser',
        password: null,
        isAdministrator: false,
        isDefaultUser: true,
        uid: 'DefaultUser'
    };

    callback(user);
};

WebdavUserManager.prototype.getUserByNamePassword = async function (username, password, callback) {
    const cacheKey = 'key-'+username+password;

    if (this._authCache[cacheKey] && this._authCache[cacheKey].expiresAt > Date.now()) {
        return callback(null, this._authCache[cacheKey].user);
    } else {
        delete this._authCache[cacheKey];
    }

    const user = await users.webdavLogin(username, password);
    if (!user) return callback(webdavErrors.UserNotFound);

    this._authCache[cacheKey] = { user: user, expiresAt: Date.now() + (60 * 1000) }; // cache for up to 1 min

    callback(null, user);
};

function expressMiddleware() {
    var webdavSrv = new webdav.WebDAVServer({
        requireAuthentification: true,
        privilegeManager: new WebdavPrivilegeManager(),
        httpAuthentication: new webdav.HTTPBasicAuthentication(new WebdavUserManager(), 'Cubby')
    });

    webdavSrv.setFileSystem('/', new webdav.PhysicalFileSystem(constants.USER_DATA_ROOT), function (success) {
        if (!success) console.error('Failed to setup webdav server!');
    });

    return webdav.extensions.express('/webdav', webdavSrv);
}

export default {
    express: expressMiddleware
};
