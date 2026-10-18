import { describe, it } from 'mocha';
import assert from 'node:assert/strict';
import exec from '../exec.js';
import safe from '@cloudron/safetydance';

describe('exec', function () {
    it('caps stderr and keeps the tail', async function () {
        const script = "process.stderr.write('x'.repeat(200000) + 'TAIL', () => process.exit(1));";

        const [error] = await safe(exec(process.execPath, [ '-e', script ], { maxStderrBytes: 1024 }));

        assert.ok(error);
        assert.equal(error.code, 1);
        assert.ok(error.stderr.includes('TAIL'));
        assert.ok(error.stderr.includes('output truncated'));
        assert.ok(error.stderr.length < 2000);
    });

    it('reports the signal when the process is killed', async function () {
        const [error] = await safe(exec(process.execPath, [ '-e', "process.kill(process.pid, 'SIGTERM')" ]));

        assert.ok(error);
        assert.equal(error.signal, 'SIGTERM');
        assert.match(error.message, /SIGTERM/);
    });

    it('rejects when the command cannot be started', async function () {
        const [error] = await safe(exec('cubby-command-that-does-not-exist', []));

        assert.ok(error);
        assert.equal(error.code, 'ENOENT');
    });
});
