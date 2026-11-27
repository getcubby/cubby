import { HttpError } from '@cloudron/connect-lastmile';
import * as tegel from '@cloudron/tegel';

function devAdmins() {
    const configured = process.env.APP_ADMIN_USERS || process.env.IMPORT_ADMIN_USERS;
    if (!configured) return null;
    return new Set(configured.split(',').map((value) => value.trim()).filter(Boolean));
}

// Cloudron exposes one SCIM "admin" role for Cloudron admins and operators of this app.
async function resolveAppAdmin(user) {
    if (!user?.username) return user;

    if (tegel.scim.isEnabled()) return await tegel.userDirectory.loginUser(user) || user;

    if (!process.env.CLOUDRON) {
        const admins = devAdmins();
        user.isAdmin = admins ? admins.has(user.username) : true;
        return user;
    }

    return user;
}

async function requireAdmin(req, res, next) {
    if (!req.user?.username) return next(new HttpError(401, 'Authentication required'));

    try {
        req.user = await resolveAppAdmin(req.user) || req.user;
    } catch (error) {
        console.error('App admin role lookup failed:', error.message);
        return next(new HttpError(503, 'Could not verify the directory role'));
    }

    if (req.user.isAdmin !== true) return next(new HttpError(403, 'Requires an administrator'));
    next();
}

export default {
    requireAdmin
};
