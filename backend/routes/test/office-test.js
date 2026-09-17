import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import http from 'node:http';
import common from './common.js';
import files from '../../files.js';
import nock from 'nock';
import superagent from '@cloudron/superagent';

const DISCOVERY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<wopi-discovery>
  <net-zone name="internal">
    <app name="application/vnd.oasis.opendocument.text">
      <action name="edit" ext="odt" urlsrc="https://office.example.com/wopi/editor"/>
    </app>
  </net-zone>
</wopi-discovery>`;

function rawPost(url, headers, body) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = http.request({
            host: u.hostname,
            port: u.port,
            path: u.pathname + u.search,
            method: 'POST',
            headers: { ...headers, 'Content-Length': body.length }
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

describe('office API', function () {
    const { setup, cleanup, serverUrl, alice, addUserFile } = common;

    before(setup);
    after(cleanup);

    function mockOffice() {
        nock('http://172.18.0.1:3006')
            .get('/default-app/office')
            .reply(200, { domain: 'office.example.com' })
            .persist();

        nock('https://office.example.com')
            .get('/hosting/discovery')
            .reply(200, DISCOVERY_XML, { 'Content-Type': 'application/xml' })
            .persist();
    }

    it('saves an edited document via the wopi put file flow', async function () {
        mockOffice();
        await addUserFile(alice.username, '/office-save.odt', 'original');

        const handleRes = await superagent.get(`${serverUrl}/api/v1/office/handle`)
            .query({ access_token: alice.token, resourcePath: '/home/office-save.odt' });
        assert.equal(handleRes.status, 200);
        assert.ok(handleRes.body.handleId);
        assert.ok(handleRes.body.token);

        const { handleId, token } = handleRes.body;

        const lockRes = await superagent.post(`${serverUrl}/api/v1/office/wopi/files/${handleId}`)
            .query({ access_token: token })
            .set('X-WOPI-Override', 'LOCK');
        assert.equal(lockRes.status, 200);
        const lockId = lockRes.headers['x-wopi-lock'];
        assert.ok(lockId);

        const content = Buffer.from('edited content');
        const putRes = await rawPost(
            `${serverUrl}/api/v1/office/wopi/files/${handleId}/contents?access_token=${token}`,
            { 'X-WOPI-Lock': lockId, 'Content-Type': 'application/vnd.oasis.opendocument.text' },
            content
        );
        assert.equal(putRes.status, 200);

        const entry = await files.get(alice.username, '/office-save.odt');
        assert.equal(entry.size, content.length);
    });

    it('reuses the handle for a live session and issues a fresh one after unlock', async function () {
        mockOffice();
        await addUserFile(alice.username, '/office-session.odt', 'original');

        const getHandle = () => superagent.get(`${serverUrl}/api/v1/office/handle`)
            .query({ access_token: alice.token, resourcePath: '/home/office-session.odt' });

        const first = await getHandle();
        assert.equal(first.status, 200);

        // a second open while the session is still alive joins the same handle
        const second = await getHandle();
        assert.equal(second.status, 200);
        assert.equal(second.body.handleId, first.body.handleId);

        // lock and then unlock to end the session
        const lockRes = await superagent.post(`${serverUrl}/api/v1/office/wopi/files/${first.body.handleId}`)
            .query({ access_token: first.body.token })
            .set('X-WOPI-Override', 'LOCK');
        assert.equal(lockRes.status, 200);
        const lockId = lockRes.headers['x-wopi-lock'];

        const unlockRes = await superagent.post(`${serverUrl}/api/v1/office/wopi/files/${first.body.handleId}`)
            .query({ access_token: first.body.token })
            .set('X-WOPI-Override', 'UNLOCK')
            .set('X-WOPI-Lock', lockId);
        assert.equal(unlockRes.status, 200);

        // reopening after the session ended gets a new handle (eurooffice caches by key)
        const third = await getHandle();
        assert.equal(third.status, 200);
        assert.notEqual(third.body.handleId, first.body.handleId);
    });
});
