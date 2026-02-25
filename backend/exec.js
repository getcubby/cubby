import assert from 'assert';
import child_process from 'child_process';
import debug from 'debug';

const debugLog = debug('cubby:exec');

export default function exec(command, args, options) {
    assert.strictEqual(typeof command, 'string');
    assert(Array.isArray(args));

    if (options) assert.strictEqual(typeof options, 'object');
    else options = {};

    debugLog(`${command} ${JSON.stringify(args)}`);

    options = Object.assign({ encoding: 'utf8', shell: false }, options);

    const p = child_process.spawn(command, args, options);
    let stderr = '';
    let stdout = '';

    return new Promise((resolve, reject) => {
        // p.stdout and p.stderr may be null if stdio option is non-default
        if (p.stdout) {
            p.stdout.on('data', (d) => {
                stdout += d.toString('utf8');
            });
        }

        if (p.stderr) {
            p.stderr.on('data', (d) => {
                stderr += d.toString('utf8');
            });
        }

        p.on('exit', (code) => {
            if (code === 0) return resolve(stdout);

            const e = new Error(`${command} errored with code ${code}`);
            e.stdout = stdout; // when promisified, this is the way to get stdout
            e.stderr = stderr; // when promisified, this is the way to get stderr
            e.code = code;

            debugLog(`${command} with args ${args.join(' ')} exited with error`, e);

            reject(e);
        });

        p.on('error', function (error) { // when the command itself could not be started
            debugLog(`${command} with args ${args.join(' ')} errored`, error);
        });
    });
}
