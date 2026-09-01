import assert from 'assert';
import debug from 'debug';
import groupFolders from '../groupfolders.js';
import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import MainError from '../mainerror.js';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:routes:groupfolders');

function validateMembers(members) {
    if (!Array.isArray(members)) return false;

    const seen = new Set();
    for (const member of members) {
        if (typeof member !== 'object' || member === null) return false;
        if (typeof member.username !== 'string' || !member.username) return false;
        if (!groupFolders.isValidRole(member.role)) return false;
        if (seen.has(member.username)) return false;
        seen.add(member.username);
    }

    return true;
}

async function add(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const name = req.body.name;
    const slug = req.body.slug || '';

    if (typeof name !== 'string' || !name) return next(new HttpError(400, 'name must be a non-empty string'));
    if (slug && !/^[a-z0-9][a-z0-9-]*$/.test(slug)) return next(new HttpError(400, 'slug must contain only lowercase letters, digits, and hyphens'));

    debugLog(`add: ${name}`);

    const [error] = await safe(groupFolders.add(slug, name, req.user.username));
    if (error) return next(MainError.toHttpError(error));

    return next(new HttpSuccess(200, {}));
}

async function list(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debugLog(`list:`);

    const [error, result] = await safe(groupFolders.list(req.user.username));
    if (error) return next(MainError.toHttpError(error));

    return next(new HttpSuccess(200, { groupFolder: result }));
}

async function update(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const id = req.params.id;
    const name = req.body.name;
    const members = req.body.members;

    if (typeof name !== 'string' || !name) return next(new HttpError(400, 'name must be a non-empty string'));
    if (!validateMembers(members)) return next(new HttpError(400, 'members must be an array of { username, role }'));

    debugLog(`update: ${id} with ${name} and members ${JSON.stringify(members)}`);

    const group = await groupFolders.get(id);
    if (!group) return next(new HttpError(404, 'no such groupfolder'));
    if (!groupFolders.isOwner(group, req.user.username)) return next(new HttpError(403, 'only owners can manage group folders'));

    // a user cannot change their own role
    const self = members.find((m) => m.username === req.user.username);
    if (!self || self.role !== groupFolders.ROLES.OWNER) return next(new HttpError(403, 'cannot change your own role'));

    const [error] = await safe(groupFolders.update(id, name, members));
    if (error) return next(MainError.toHttpError(error));

    return next(new HttpSuccess(200, {}));
}

async function remove(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const id = req.params.id;

    debugLog(`remove: ${id}`);

    const group = await groupFolders.get(id);
    if (!group) return next(new HttpError(404, 'no such groupfolder'));
    if (!groupFolders.isOwner(group, req.user.username)) return next(new HttpError(403, 'only owners can delete group folders'));

    const [error] = await safe(groupFolders.remove(id));
    if (error) return next(MainError.toHttpError(error));

    return next(new HttpSuccess(200, {}));
}

export default {
    add,
    list,
    update,
    remove
};
