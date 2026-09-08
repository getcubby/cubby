import assert from 'assert';
import debug from 'debug';
import groupFolders from '../groupfolders.js';
import groups from '../groups.js';
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

function validateGroupMembers(groupMembers) {
    if (!Array.isArray(groupMembers)) return false;

    const seen = new Set();
    for (const member of groupMembers) {
        if (typeof member !== 'object' || member === null) return false;
        if (typeof member.groupId !== 'string' || !member.groupId) return false;
        if (!groupFolders.isValidRole(member.role)) return false;
        if (seen.has(member.groupId)) return false;
        seen.add(member.groupId);
    }

    return true;
}

// after applying members/groupMembers, is the user still an owner (directly or via a group)?
async function willRemainOwner(username, members, groupMembers) {
    if (members.some((m) => m.username === username && m.role === groupFolders.ROLES.OWNER)) return true;

    const membershipGroupIds = new Set(await groups.getMembershipGroupIds(username));
    return groupMembers.some((gm) => gm.role === groupFolders.ROLES.OWNER && membershipGroupIds.has(gm.groupId));
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

    for (const folder of result) {
        folder.myRole = await groupFolders.getRole(folder, req.user.username);
    }

    return next(new HttpSuccess(200, { groupFolder: result }));
}

async function update(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const id = req.params.id;
    const name = req.body.name;
    const members = req.body.members;
    const groupMembers = req.body.groupMembers || [];

    if (typeof name !== 'string' || !name) return next(new HttpError(400, 'name must be a non-empty string'));
    if (!validateMembers(members)) return next(new HttpError(400, 'members must be an array of { username, role }'));
    if (!validateGroupMembers(groupMembers)) return next(new HttpError(400, 'groupMembers must be an array of { groupId, role }'));

    debugLog(`update: ${id} with ${name} and members ${JSON.stringify(members)} groupMembers ${JSON.stringify(groupMembers)}`);

    const group = await groupFolders.get(id);
    if (!group) return next(new HttpError(404, 'no such groupfolder'));
    if (!await groupFolders.isOwner(group, req.user.username)) return next(new HttpError(403, 'only owners can manage group folders'));

    // an owner cannot change their own role (directly or via a group)
    if (!await willRemainOwner(req.user.username, members, groupMembers)) return next(new HttpError(403, 'cannot change your own role'));

    const [error] = await safe(groupFolders.update(id, name, members, groupMembers));
    if (error) return next(MainError.toHttpError(error));

    return next(new HttpSuccess(200, {}));
}

async function remove(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const id = req.params.id;

    debugLog(`remove: ${id}`);

    const group = await groupFolders.get(id);
    if (!group) return next(new HttpError(404, 'no such groupfolder'));
    if (!await groupFolders.isOwner(group, req.user.username)) return next(new HttpError(403, 'only owners can delete group folders'));

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
