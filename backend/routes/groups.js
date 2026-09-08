import assert from 'assert';
import groups from '../groups.js';
import MainError from '../mainerror.js';
import { HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';

async function list(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const [error, result] = await safe(groups.listWithMembers());
    if (error) return next(MainError.toHttpError(error));

    return next(new HttpSuccess(200, { groups: result }));
}

export default {
    list
};
