import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import common from './common.js';
import database from '../../database.js';
import recent from '../../recent.js';
import superagent from '@cloudron/superagent';

describe('misc API', function () {
    const { setup, cleanup, serverUrl, alice, withToken, addUserFile } = common;

    before(setup);
    after(cleanup);

    it('can healthcheck', async function () {
        const response = await superagent.get(`${serverUrl}/api/healthcheck`);
        assert.equal(response.status, 200);
    });

    it('can get public config', async function () {
        const response = await superagent.get(`${serverUrl}/api/v1/config`);
        assert.equal(response.status, 200);
        assert.ok(response.body.viewers);
        assert.equal(typeof response.body.appPasswordsUrl, 'string');
    });

    it('requires entries to download', async function () {
        const response = await withToken(superagent.get(`${serverUrl}/api/v1/download`), alice.token)
            .ok(() => true);
        assert.equal(response.status, 400);
    });

    it('lists recent files within days_ago', async function () {
        await addUserFile(alice.username, '/recent-new.txt', 'new');
        await addUserFile(alice.username, '/recent-old.txt', 'old');
        await recent.add(alice.username, '/home/recent-new.txt');
        await recent.add(alice.username, '/home/recent-old.txt');

        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
        await database.query('UPDATE recents SET accessed_at = ? WHERE file_path = ?', [ fiveDaysAgo, '/recent-old.txt' ]);

        async function listNames(query) {
            const response = await withToken(superagent.get(`${serverUrl}/api/v1/recent`), alice.token).query(query);
            assert.equal(response.status, 200);
            return response.body.recents.map(r => r.filePath).sort();
        }

        assert.deepEqual(await listNames({}), [ '/recent-new.txt', '/recent-old.txt' ]);
        assert.deepEqual(await listNames({ days_ago: 2 }), [ '/recent-new.txt' ]);
        assert.deepEqual(await listNames({ days_ago: 1000 }), [ '/recent-new.txt', '/recent-old.txt' ]);

        const invalid = await withToken(superagent.get(`${serverUrl}/api/v1/recent`), alice.token)
            .query({ days_ago: '-1' })
            .ok(() => true);
        assert.equal(invalid.status, 400);
    });
});
