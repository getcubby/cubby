const assert = require('assert'),
    child_process = require('child_process'),
    debug = require('debug')('cubby:exec');

// default encoding utf8, no shell, handles input, separate args, wait for process to finish
exports = module.exports = async function execArgs(tag, file, args, options) {
    assert.strictEqual(typeof tag, 'string');
    assert.strictEqual(typeof file, 'string');
    assert(Array.isArray(args));
    assert.strictEqual(typeof options, 'object');

    debug(`${tag} execArgs: ${file} ${JSON.stringify(args)}`);

    const execOptions = Object.assign({ encoding: 'utf8', shell: false }, options);

    return new Promise((resolve, reject) => {
        const cp = child_process.execFile(file, args, execOptions, function (error, stdout, stderr) {
            if (!error) return resolve(stdout);

            const e = new Error(`${tag} errored with code ${error.code} message ${error.message}`);
            e.stdout = stdout; // when promisified, this is the way to get stdout
            e.stderr = stderr; // when promisified, this is the way to get stderr
            e.code = error.code;
            e.signal = error.signal;
            debug(`${tag}: ${file} with args ${args.join(' ')} errored`, error);
            reject(e);
        });

        // https://github.com/nodejs/node/issues/25231
        if (options.input) {
            cp.stdin.write(options.input);
            cp.stdin.end();
        }
    });
};
