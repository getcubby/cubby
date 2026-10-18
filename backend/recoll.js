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
    'idxloglevel = 2',
    'skippedNames+ = ~$* .DS_Store Thumbs.db ._*'
].join('\n');

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
            fs.writeFileSync(configFilePath, `topdirs = ${pathsToIndex.join(' ')}\n${RECOLL_CONFIG_OPTIONS}\n`);

            const [indexError] = await safe(exec('recollindex', [ '-c', configPath ], { stdio: ['ignore', 'ignore', 'pipe'] }));
            if (indexError) {
                if (isLockContention(indexError)) {
                    debugLog(`Skipped indexing ${username}: another recollindex is already running`);
                } else {
                    console.error(`Failed to create or update recoll index for user ${username}.`, indexError);
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
