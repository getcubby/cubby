import assert from 'assert';
import crypto from 'crypto';
import debug from 'debug';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import paths from './paths.js';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:uploads');

function ensureRoot() {
    fs.mkdirSync(paths.UPLOADS_ROOT, { recursive: true });
}

// unique temp file for single-shot (non-chunked) uploads. the write stream creates it lazily
function createPartFile() {
    ensureRoot();

    return path.join(paths.UPLOADS_ROOT, crypto.randomBytes(16).toString('hex'));
}

// deterministic session id so all chunks of one upload resolve to the same part file
function uploadIdFor(usernameOrGroupfolder, filePath) {
    assert.strictEqual(typeof usernameOrGroupfolder, 'string');
    assert.strictEqual(typeof filePath, 'string');

    return crypto.createHash('sha256').update(`${usernameOrGroupfolder}:${filePath}`).digest('hex');
}

function sessionDir(uploadId) {
    assert.strictEqual(typeof uploadId, 'string');

    return path.join(paths.UPLOADS_ROOT, uploadId);
}

function partPath(uploadId) {
    return path.join(sessionDir(uploadId), 'part');
}

function metaPath(uploadId) {
    return path.join(sessionDir(uploadId), 'meta.json');
}

function resetSession(uploadId, meta) {
    assert.strictEqual(typeof uploadId, 'string');
    assert.strictEqual(typeof meta, 'object');

    ensureRoot();

    fs.rmSync(sessionDir(uploadId), { recursive: true, force: true });
    fs.mkdirSync(sessionDir(uploadId), { recursive: true });
    fs.writeFileSync(metaPath(uploadId), JSON.stringify(meta));
}

async function readMeta(uploadId) {
    assert.strictEqual(typeof uploadId, 'string');

    const [error, content] = await safe(fsPromises.readFile(metaPath(uploadId), 'utf8'));
    if (error) return null;

    try {
        return JSON.parse(content);
    } catch {
        return null;
    }
}

async function writeMeta(uploadId, meta) {
    assert.strictEqual(typeof uploadId, 'string');
    assert.strictEqual(typeof meta, 'object');

    const [error] = await safe(fsPromises.writeFile(metaPath(uploadId), JSON.stringify(meta)));
    if (error) throw error;
}

async function removeSession(uploadId) {
    assert.strictEqual(typeof uploadId, 'string');

    await safe(fsPromises.rm(sessionDir(uploadId), { recursive: true, force: true }));
}

async function removePartFile(tempPartPath) {
    assert.strictEqual(typeof tempPartPath, 'string');

    await safe(fsPromises.rm(tempPartPath, { force: true }));
}

// last activity time for a temp entry: for chunked sessions use the part file (updated on each
// appended chunk), for single-shot parts use the file itself
async function entryMtime(entryPath) {
    const [statError, stat] = await safe(fsPromises.stat(entryPath));
    if (statError) return null;

    if (!stat.isDirectory()) return stat.mtime;

    const [partStatError, partStat] = await safe(fsPromises.stat(path.join(entryPath, 'part')));
    if (!partStatError) return partStat.mtime;

    return stat.mtime;
}

async function cleanupStale(maxAgeMs) {
    assert.strictEqual(typeof maxAgeMs, 'number');

    const [readdirError, entries] = await safe(fsPromises.readdir(paths.UPLOADS_ROOT));
    if (readdirError) {
        if (readdirError.code === 'ENOENT') return; // nothing to clean yet
        debugLog(`cleanupStale: readdir failed: ${readdirError.message}`);
        return;
    }

    const cutoff = Date.now() - maxAgeMs;
    for (const entry of entries) {
        const entryPath = path.join(paths.UPLOADS_ROOT, entry);
        const mtime = await entryMtime(entryPath);
        if (!mtime) continue;

        if (mtime.getTime() < cutoff) {
            debugLog(`cleanupStale: removing stale upload ${entry}`);
            await safe(fsPromises.rm(entryPath, { recursive: true, force: true }));
        }
    }
}

export default {
    createPartFile,
    uploadIdFor,
    partPath,
    resetSession,
    readMeta,
    writeMeta,
    removeSession,
    removePartFile,
    cleanupStale,
};
