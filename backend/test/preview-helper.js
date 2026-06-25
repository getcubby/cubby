import assert from 'node:assert/strict';
import fs from 'node:fs';
import preview from '../preview.js';

// 1x1 PNG
export const MINIMAL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export async function waitForPreview(hash, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const localPath = preview.getLocalPath(hash);
        if (localPath) {
            assert.ok(fs.statSync(localPath).size > 0);
            return localPath;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }

    assert.fail(`preview ${hash} was not generated`);
}
