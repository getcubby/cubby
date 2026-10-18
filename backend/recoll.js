import assert from 'assert';
import constants from './constants.js';
import paths from './paths.js';
import debug from 'debug';
import exec from './exec.js';
import files from './files.js';
import fs from 'fs';
import groupFolders from './groupfolders.js';
import path from 'path';
import users from './users.js';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:search');

const INDEX_LOG_LEVEL = /^[1-6]$/.test(process.env.CUBBY_RECOLL_LOGLEVEL || '') ? process.env.CUBBY_RECOLL_LOGLEVEL : '4';

// Keep the indexer suitable for a small app container. Without these, recoll
// auto-configures multiple indexing threads and allows external filters to use
// several gigabytes of memory. It also logs every indexed document at level 3,
// which ends up as a huge stderr buffer in Node.
const RECOLL_CONFIG_OPTIONS = [
    'testmodifusemtime = 1',
    'idxflushmb = 10',
    'thrQSizes = -1 -1 -1',
    'filtermaxmbytes = 512',
    'filtermaxseconds = 300',
    'helperlogfilename = /dev/null',
    `idxloglevel = ${INDEX_LOG_LEVEL}`,
    'excludedmimetypes = application/zip application/x-zip-compressed application/x-7z-compressed application/x-rar application/x-rar-compressed application/x-tar',
    'zipSkippedNames = __MACOSX/* */._*',
    'skippedNames+ = ~$* .DS_Store Thumbs.db ._*',
    'noContentSuffixes+ = .dmg .iso .img .vmdk .vdi .qcow2'
].join('\n');

const INDEX_STATUS_FILE = 'idxstatus.txt';
const SKIPPED_PATHS_FILE = 'skipped-paths.json';
const MAX_INDEX_ATTEMPTS = 2;
const MAX_SKIPPED_PATHS = 100;
const MAX_LOGGED_STDERR_BYTES = 16 * 1024;

const SCHEDULE_DELAY_MS = 10 * 1000;

// user id -> in-flight indexing Promise, to coalesce concurrent indexing of
// the same user into a single recollindex run (recollindex takes an exclusive
// flock per user config dir and fails if two run concurrently).
const inflight = {};

// recollindex is memory hungry even with conservative settings. Run only one
// at a time across all users so a group folder change does not start one
// process per member concurrently.
let indexQueue = Promise.resolve();

function enqueueIndex(task) {
    const run = indexQueue.then(task, task);
    indexQueue = run.catch(() => {});
    return run;
}

function isLockContention(error) {
    return typeof error?.stderr === 'string'
        && (error.stderr.includes('exclusive indexer') || error.stderr.includes('flock failed'));
}

function cgroupDirectory() {
    try {
        for (const line of fs.readFileSync('/proc/self/cgroup', 'utf8').split('\n')) {
            const v2 = line.match(/^0::(.*)$/);
            if (v2) return path.join('/sys/fs/cgroup', v2[1]);

            const v1 = line.match(/^\d+:memory:(.*)$/);
            if (v1) return path.join('/sys/fs/cgroup/memory', v1[1]);
        }
    } catch {
        // fall through
    }

    return '/sys/fs/cgroup';
}

function memorySnapshot() {
    const read = (filePath) => {
        try {
            return fs.readFileSync(filePath, 'utf8').trim();
        } catch {
            return null;
        }
    };

    const parts = [ `node rss ${process.memoryUsage().rss}` ];
    const cgroupDir = cgroupDirectory();

    const current = read(path.join(cgroupDir, 'memory.current'));
    const max = read(path.join(cgroupDir, 'memory.max'));
    if (current && max) {
        parts.push(`cgroup ${current}/${max}`);
    } else {
        const usage = read(path.join(cgroupDir, 'memory.usage_in_bytes'));
        const limit = read(path.join(cgroupDir, 'memory.limit_in_bytes'));
        if (usage && limit) parts.push(`cgroup ${usage}/${limit}`);
    }

    const peak = read(path.join(cgroupDir, 'memory.peak'));
    if (peak) parts.push(`cgroup peak ${peak}`);

    const events = read(path.join(cgroupDir, 'memory.events'));
    const oomKill = events?.match(/^oom_kill\s+(\d+)/m);
    if (oomKill) parts.push(`cgroup oom_kill ${oomKill[1]}`);

    const pidsCurrent = read(path.join(cgroupDir, 'pids.current'));
    const pidsMax = read(path.join(cgroupDir, 'pids.max'));
    if (pidsCurrent && pidsMax) parts.push(`pids ${pidsCurrent}/${pidsMax}`);

    const pidsPeak = read(path.join(cgroupDir, 'pids.peak'));
    if (pidsPeak) parts.push(`pids peak ${pidsPeak}`);

    const meminfo = read('/proc/meminfo');
    const available = meminfo?.match(/^MemAvailable:\s+(\d+) kB/m);
    if (available) parts.push(`host available ${available[1]}kB`);

    return parts.join(', ');
}

function trimStderrForLog(error) {
    if (typeof error?.stderr === 'string' && error.stderr.length > MAX_LOGGED_STDERR_BYTES) {
        error.stderr = `[output truncated, showing last ${MAX_LOGGED_STDERR_BYTES} characters]\n${error.stderr.slice(-MAX_LOGGED_STDERR_BYTES)}`;
    }

    return error;
}

function readIndexStatus(configPath) {
    try {
        const content = fs.readFileSync(path.join(configPath, INDEX_STATUS_FILE), 'utf8');
        const status = {};

        for (const line of content.split('\n')) {
            const separator = line.indexOf(' = ');
            if (separator === -1) continue;
            status[line.slice(0, separator).trim()] = line.slice(separator + 3).trim();
        }

        return status;
    } catch {
        return null;
    }
}

// idxstatus.txt contains the file currently being processed (possibly with a
// subdocument path or byte offset after a "|"). Return the physical file when
// it can be determined, but never a directory.
function currentIndexFilePath(status) {
    if (!status?.fn) return null;

    const candidates = [ status.fn ];
    const ipathSeparator = status.fn.indexOf('|');
    if (ipathSeparator > 0) candidates.push(status.fn.slice(0, ipathSeparator));

    for (const candidate of candidates) {
        const stat = safe.fs.statSync(candidate);
        if (stat && stat.isFile()) return candidate;
    }

    return null;
}

// idxstatus.txt truncates long paths, so use the full FileInterner line from
// the verbose indexer log when available.
function lastIndexPathFromStderr(stderr) {
    if (typeof stderr !== 'string') return null;

    let lastPath = null;
    const matcher = /FileInterner::init fn \[([^\]]+)\] mime/g;
    for (const match of stderr.matchAll(matcher)) lastPath = match[1];

    return lastPath;
}

function currentIndexFilePathFromStderr(stderr) {
    if (typeof stderr !== 'string') return null;

    const paths = [];
    const matcher = /FileInterner::init fn \[([^\]]+)\] mime/g;
    for (const match of stderr.matchAll(matcher)) paths.push(match[1]);

    for (let i = paths.length - 1; i >= 0; i--) {
        const candidates = [ paths[i] ];
        const ipathSeparator = paths[i].indexOf('|');
        if (ipathSeparator > 0) candidates.push(paths[i].slice(0, ipathSeparator));

        for (const candidate of candidates) {
            const stat = safe.fs.statSync(candidate);
            if (stat && stat.isFile()) return candidate;
        }
    }

    return null;
}

function readSkippedPaths(configPath) {
    try {
        const content = fs.readFileSync(path.join(configPath, SKIPPED_PATHS_FILE), 'utf8');
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) return [];

        return parsed.filter((entry) => typeof entry === 'string' && fs.existsSync(entry) && quoteRecollPath(entry));
    } catch {
        return [];
    }
}

function writeSkippedPaths(configPath, skippedPaths) {
    fs.writeFileSync(path.join(configPath, SKIPPED_PATHS_FILE), `${JSON.stringify(skippedPaths, null, 2)}\n`);
}

function addSkippedPath(configPath, filePath) {
    if (!quoteRecollPath(filePath)) return false;

    const skippedPaths = readSkippedPaths(configPath);
    if (skippedPaths.includes(filePath)) return false;

    skippedPaths.push(filePath);
    writeSkippedPaths(configPath, skippedPaths.slice(-MAX_SKIPPED_PATHS));
    return true;
}

// Recoll's config parser does not support escaping quotes or backslashes in
// quoted values, so those paths cannot be represented in skippedPaths.
function quoteRecollPath(filePath) {
    if (filePath.includes('"') || filePath.includes('\\') || /[\r\n]/.test(filePath)) return null;

    return `"${filePath}"`;
}

function buildRecollConfig(pathsToIndex, skippedPaths) {
    const lines = [
        `topdirs = ${pathsToIndex.join(' ')}`,
        RECOLL_CONFIG_OPTIONS
    ];

    const quotedSkippedPaths = [];
    for (const skippedPath of skippedPaths) {
        const quoted = quoteRecollPath(skippedPath);
        if (quoted) quotedSkippedPaths.push(quoted);
        else debugLog(`Cannot represent path in recoll skippedPaths: ${skippedPath}`);
    }

    if (quotedSkippedPaths.length) lines.push(`skippedPaths = ${quotedSkippedPaths.join(' ')}`);

    return `${lines.join('\n')}\n`;
}

async function runRecollIndex(configPath, configFilePath, pathsToIndex) {
    let result = null;

    for (let attempt = 0; attempt < MAX_INDEX_ATTEMPTS; attempt++) {
        const skippedPaths = readSkippedPaths(configPath);
        if (skippedPaths.length) debugLog(`Skipping ${skippedPaths.length} path(s) for ${configPath}`);

        // avoid using a stale current-file value if the indexer is killed
        // before it updates its status
        fs.rmSync(path.join(configPath, INDEX_STATUS_FILE), { force: true });
        fs.writeFileSync(configFilePath, buildRecollConfig(pathsToIndex, skippedPaths));

        const [indexError] = await safe(exec('recollindex', [ '-c', configPath ], { stdio: ['ignore', 'ignore', 'pipe'], maxStderrBytes: 1024 * 1024 }));
        if (!indexError) return { indexError: null, status: null, currentFile: null };

        const status = readIndexStatus(configPath);
        const lastPath = lastIndexPathFromStderr(indexError.stderr);
        const currentFile = currentIndexFilePathFromStderr(indexError.stderr) || currentIndexFilePath(status);
        result = { indexError, status, lastPath, currentFile };

        if (indexError.signal !== 'SIGKILL' || !currentFile) break;
        if (!addSkippedPath(configPath, currentFile)) break;

        console.error(`recollindex was killed by SIGKILL while indexing ${currentFile} (${memorySnapshot()}). Adding it to the skip list and retrying.`);
    }

    return result;
}

async function index() {
    if (constants.TEST) return;

    const userList = await users.list();
    for (const user of userList) await indexByUsername(user.id);
}

// TODO provide faster index operations on individual paths:
// recollindex -e [<filepath [path ...]>]
//     Purge data for individual files. No stem database updates.
//     Reads paths on stdin if none is given as argument.
// recollindex -i [-f] [-Z] [-P] [<filepath [path ...]>]
//     Index individual files. No database purge or stem database updates
//     Will read paths on stdin if none is given as argument
//     -f : ignore skippedPaths and skippedNames while doing this
//     -Z : force reindex of each file
//     -P : force running a purge pass (very special use, don't do this if not sure)
// recollindex -r [-K] [-f] [-Z] [-p pattern] <top>
//    Recursive partial reindex.
//      -p : filter file names, multiple instances are allowed, e.g.:
//         -p *.odt -p *.pdf
//      -K : skip previously failed files (they are retried by default)

const scheduled = {};
function scheduleIndexByUsername(username) {
    assert.strictEqual(typeof username, 'string');

    if (constants.TEST) return;

    debugLog(`scheduleIndexByUsername: ${username} ...`);

    if (scheduled[username]) clearTimeout(scheduled[username]);

    const timer = setTimeout(async () => {
        // do not delete a newer timer that was scheduled while this run was
        // waiting or indexing
        if (scheduled[username] === timer) delete scheduled[username];

        debugLog(`scheduledIndex for ${username}`);

        try {
            await indexByUsername(username);
        } catch (error) {
            console.error(`Search index update failed for user ${username}.`, error);
        }
    }, SCHEDULE_DELAY_MS);

    scheduled[username] = timer;
}

async function indexByUsername(username, schedule = false) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof schedule, 'boolean');

    if (schedule) return scheduleIndexByUsername(username);

    if (inflight[username]) return inflight[username];

    const run = enqueueIndex(async () => {
        try {
            debugLog(`indexByUsername: ${username} ...`);

            const configPath = path.join(paths.SEARCH_INDEX_PATH, username);
            const configFilePath = path.join(configPath, 'recoll.conf');

            fs.mkdirSync(configPath, { recursive: true });

            // collect all paths we want to index and write config file
            const pathsToIndex = [ path.join(paths.USER_DATA_ROOT, username) ];
            for (const groupFolder of await groupFolders.list(username)) {
                pathsToIndex.push(path.join(paths.GROUPS_DATA_ROOT, groupFolder.id));
            }

            const result = await runRecollIndex(configPath, configFilePath, pathsToIndex);
            if (result?.indexError) {
                if (isLockContention(result.indexError)) {
                    debugLog(`Skipped indexing ${username}: another recollindex is already running`);
                } else {
                    const currentPath = result.currentFile || result.lastPath || result.status?.fn;
                    const details = [ currentPath ? `while indexing ${currentPath}` : null, memorySnapshot() ].filter(Boolean).join(', ');
                    console.error(`Failed to create or update recoll index for user ${username}${details ? ` (${details})` : ''}.`, trimStderrForLog(result.indexError));
                }
            }
        } catch (error) {
            console.error(`Failed to create or update recoll index for user ${username}.`, error);
        }

        debugLog(`indexByUsername: ${username} done`);
    });

    inflight[username] = run;
    try {
        await run;
    } finally {
        if (inflight[username] === run) delete inflight[username];
    }
}

async function indexByGroupFolder(groupFolder, schedule = false) {
    assert.strictEqual(typeof groupFolder, 'string');
    assert.strictEqual(typeof schedule, 'boolean');

    debugLog(`indexByGroupFolder: ${groupFolder} ...`);

    for (const userId of await groupFolders.getMemberUserIds(groupFolder)) await indexByUsername(userId, schedule);

    debugLog(`indexByGroupFolder: ${groupFolder} done`);
}

async function searchByUsername(username, query) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof query, 'string');

    debugLog(`searchByUsername: ${username} ${query}`);

    const configPath = path.join(paths.SEARCH_INDEX_PATH, username);
    const dbFilePath = path.join(configPath, 'xapiandb');
    if (!fs.existsSync(dbFilePath)) await indexByUsername(username);

    const out = await exec('recoll', [ '-t', '-F', 'url filename abstract', '-c', configPath, query ]);

    const results = [];

    // first two lines and last are info
    for (const line of out.split('\n').slice(2).slice(0, -1)) {
        const parts = line.split(' ');
        const filePath = Buffer.from(parts[0], 'base64').toString();
        const fileName = Buffer.from(parts[1], 'base64').toString();
        const abstract = Buffer.from(parts[2], 'base64').toString();

        // skip archives
        if (!filePath.endsWith(fileName)) continue;

        const [getError, entry] = await safe(files.getByAbsolutePath(filePath.slice('file://'.length)));
        if (getError) debugLog(`searchByUsername: Entry not found for ${filePath}`, getError);

        // skip
        if (!entry) continue;

        const result = {
            filePath,
            fileName,
            abstract,
            entry: entry.withoutPrivate(username),
        };

        results.push(result);
    }

    return results;
}

export default {
    index,
    indexByUsername,
    indexByGroupFolder,

    searchByUsername
};
