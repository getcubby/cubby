import assert from 'assert';
import child_process from 'child_process';
import debug from 'debug';

const debugLog = debug('cubby:exec');

// Some commands (notably recollindex) can emit a lot of diagnostics. Keep only
// the tail so a failing process cannot grow the Node heap without bound.
const DEFAULT_MAX_STDERR_BYTES = 64 * 1024;

function truncateToTail(text, maxBytes) {
    const buffer = Buffer.from(text, 'utf8');
    if (buffer.length <= maxBytes) return text;

    return buffer.subarray(buffer.length - maxBytes).toString('utf8');
}

function appendOutput(current, chunk, maxBytes, wasTruncated) {
    const next = current + chunk;
    if (!maxBytes || Buffer.byteLength(next, 'utf8') <= maxBytes) return { text: next, truncated: wasTruncated };

    return { text: truncateToTail(next, maxBytes), truncated: true };
}

function withTruncationMarker(text, truncated) {
    if (!truncated) return text;

    return `[output truncated, showing last ${Buffer.byteLength(text, 'utf8')} bytes]\n${text}`;
}

export default function exec(command, args, options) {
    assert.strictEqual(typeof command, 'string');
    assert(Array.isArray(args));

    if (options) assert.strictEqual(typeof options, 'object');
    else options = {};

    debugLog(`${command} ${JSON.stringify(args)}`);

    options = Object.assign({ encoding: 'utf8', shell: false, maxStderrBytes: DEFAULT_MAX_STDERR_BYTES }, options);

    const maxStdoutBytes = options.maxStdoutBytes || 0;
    const maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;
    delete options.maxStdoutBytes;
    delete options.maxStderrBytes;

    const p = child_process.spawn(command, args, options);
    let stderr = '';
    let stdout = '';
    let stderrTruncated = false;
    let stdoutTruncated = false;

    return new Promise((resolve, reject) => {
        // p.stdout and p.stderr may be null if stdio option is non-default
        if (p.stdout) {
            p.stdout.on('data', (d) => {
                const result = appendOutput(stdout, d.toString('utf8'), maxStdoutBytes, stdoutTruncated);
                stdout = result.text;
                stdoutTruncated = result.truncated;
            });
        }

        if (p.stderr) {
            p.stderr.on('data', (d) => {
                const result = appendOutput(stderr, d.toString('utf8'), maxStderrBytes, stderrTruncated);
                stderr = result.text;
                stderrTruncated = result.truncated;
            });
        }

        p.on('close', (code, signal) => {
            const out = withTruncationMarker(stdout, stdoutTruncated);
            if (code === 0 && !signal) return resolve(out);

            const message = signal ? `${command} was killed by ${signal}` : `${command} errored with code ${code}`;
            const e = new Error(message);
            e.stdout = out; // when promisified, this is the way to get stdout
            e.stderr = withTruncationMarker(stderr, stderrTruncated); // when promisified, this is the way to get stderr
            e.code = code;
            e.signal = signal;

            debugLog(`${command} with args ${args.join(' ')} exited with error: ${e.message}`);

            reject(e);
        });

        p.on('error', function (error) { // when the command itself could not be started
            error.stdout = withTruncationMarker(stdout, stdoutTruncated);
            error.stderr = withTruncationMarker(stderr, stderrTruncated);

            debugLog(`${command} with args ${args.join(' ')} errored`, error);

            reject(error);
        });
    });
}
