import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { clean, withSpinner } from '../../scripts/clean.mjs';
import { parseEnvironment, safePath, inside, formatStatus } from '../../scripts/lib/runtime.mjs';
import { validateEnvironment } from '../../scripts/validate-env.mjs';
import { validateCertificates } from '../../scripts/validate-certs.mjs';
import { checkPorts, portAvailable, parseListeners, parsePort, stopCommand } from '../../scripts/check-ports.mjs';

const execute = promisify(execFile);
const quiet = () => {};

async function fixture(t) {
  const parent = await realpath(os.tmpdir());
  const root = await mkdtemp(path.join(parent, 'modulon-scripts-'));
  t.after(async () => {
    const resolved = await realpath(root);
    assert.ok(inside(parent, resolved) && path.basename(resolved).startsWith('modulon-scripts-'));
    await rm(resolved, { recursive: true, force: true });
  });
  return root;
}

async function put(root, file, value = 'fixture') {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value);
  return target;
}

test('cleanup previews and removes dependencies, outputs and compiler caches by default', async (t) => {
  const root = await fixture(t);
  const preserved = ['apps/web/.env', 'apps/web/src/page.ts', 'apps/web/src/keep.tsbuildinfo', 'apps/pyworker/.venv/keep',
    'infra/local/data/keep', 'infra/local/certs/localhost-key.pem', 'pnpm-lock.yaml',
    'packages/database/prisma/migrations/keep'];
  const generated = ['apps/web/.next/cache', 'packages/database/dist/client', 'dist/output',
    'node_modules/keep', 'apps/web/node_modules/keep', 'packages/database/node_modules/keep',
    'tsconfig.tsbuildinfo', 'apps/web/tsconfig.tsbuildinfo', 'packages/database/.eslintcache'];
  for (const file of [...preserved, ...generated]) {
    await put(root, file);
  }
  assert.equal(await clean(root, { dryRun: true, log: quiet }), 9);
  for (const file of [...preserved, ...generated]) await access(path.join(root, file));
  assert.equal(await clean(root, { log: quiet }), 9);
  await assert.rejects(access(path.join(root, 'dist')), { code: 'ENOENT' });
  for (const file of preserved) await access(path.join(root, file));
  for (const file of generated) await assert.rejects(access(path.join(root, file)), { code: 'ENOENT' });
  assert.equal(await clean(root, { log: quiet }), 0);
});

test('cleanup refuses junctions and paths outside the root', async (t) => {
  const external = await fixture(t);
  await put(external, 'keep');
  for (const name of ['dist', 'node_modules']) {
    const root = await fixture(t);
    await symlink(external, path.join(root, name), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(clean(root, { log: quiet }), /linked path/);
    await access(path.join(external, 'keep'));
    await assert.rejects(safePath(root, '..'), /workspace root/);
    await assert.rejects(safePath(root, '.'), /workspace root/);
  }
});

test('cleanup reports successful deletions only after removal and keeps previews distinct', async (t) => {
  const root = await fixture(t);
  await put(root, 'node_modules/keep');
  const preview = [];
  await clean(root, { dryRun: true, log: line => preview.push(line) });
  assert.ok(preview.every(line => line.startsWith('[preview]')));
  await access(path.join(root, 'node_modules/keep'));
  const messages = [];
  await clean(root, { log: line => messages.push(line) });
  await assert.rejects(access(path.join(root, 'node_modules')), { code: 'ENOENT' });
  assert.ok(messages.includes('[success] deleted files: node_modules'));
  assert.equal(messages.at(-1), '[success] deleted files from 1 generated path.');
  await symlink(root, path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const failed = [];
  await assert.rejects(clean(root, { log: line => failed.push(line) }), /linked path/);
  assert.ok(!failed.some(line => line.startsWith('[success]')));
});

test('spinner animates only on a terminal and clears its timer on success or failure', async () => {
  const output = [];
  const stream = { isTTY: true, write: chunk => { output.push(chunk); return true; } };
  assert.equal(await withSpinner('Deleting fixture...', async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return 'done';
  }, { stream }), 'done');
  assert.ok(output.some(chunk => chunk === '| Deleting fixture...'));
  assert.ok(output.some(chunk => chunk === '/ Deleting fixture...'));
  const afterSuccess = output.length;
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(output.length, afterSuccess);
  await assert.rejects(withSpinner('Failing fixture...', async () => {
    throw new Error('fixture failure');
  }, { stream }), /fixture failure/);
  const afterFailure = output.length;
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(output.length, afterFailure);
  const plain = { isTTY: false, write: () => assert.fail('Non-TTY output must not contain animation') };
  assert.equal(await withSpinner('Quiet fixture...', async () => 42, { stream: plain }), 42);
});

test('env parsing supports comments, export and multiline values, rejects duplicates without leaking values', () => {
  assert.deepEqual({ ...parseEnvironment('export A=one\nB="two\nlines" # comment\n# comment', 'env') },
    { A: 'one', B: 'two\nlines' });
  for (const source of ['TOKEN=super-secret\nTOKEN=other-secret', 'super-secret invalid', 'TOKEN="super-secret']) {
    assert.throws(() => parseEnvironment(source, 'env'), (error) => {
      assert.ok(!error.message.includes('super-secret'));
      assert.ok(!error.message.includes('other-secret'));
      return true;
    });
  }
});

test('DEV env validation discovers templates, ignores files without templates and excludes generated directories', async (t) => {
  const root = await fixture(t);
  const messages = [];
  const options = { mode: 'dev', log: (line) => messages.push(line) };
  // An env file without a template is ignored, even when its content is invalid.
  await put(root, 'apps/api/.env', 'not an assignment');
  await validateEnvironment(root, options);
  assert.ok(messages.some((line) => line.includes('Nothing to validate')));
  await put(root, 'node_modules/dependency/.env.example', 'IGNORE_ME=');
  await put(root, 'apps/web/.next/.env.example', 'IGNORE_ME=');
  await put(root, 'apps/web/.env.example', 'PORT=3000\nAPP_URL=http://localhost:3000');
  await assert.rejects(validateEnvironment(root, options), /failed for 1 file pair/);
  await put(root, 'apps/web/.env', 'PORT=3000');
  await assert.rejects(validateEnvironment(root, options), /failed for 1 file pair/);
  assert.ok(messages.some((line) => line.includes('missing variables APP_URL')));
  await put(root, 'apps/web/.env', 'PORT=3000\nAPP_URL=http://localhost:3000');
  await validateEnvironment(root, options);
  assert.ok(messages.includes('[ok] 1 env template(s) validated. Credentials and service connectivity were not checked.'));
  await put(root, 'packages/new-package/config/.env.example', 'NEW_FIELD=');
  await assert.rejects(validateEnvironment(root, options), /failed for 1 file pair/);
  assert.ok(messages.some((line) => line.includes('Missing env file: packages/new-package/config/.env') &&
    line.includes('Required by: packages/new-package/config/.env.example')));
  await put(root, 'packages/new-package/config/.env', 'NEW_FIELD=ready');
  await validateEnvironment(root, options);
  assert.ok(messages.includes('[ok] 2 env template(s) validated. Credentials and service connectivity were not checked.'));
});

test('status output uses terminal colors and honors FORCE_COLOR and NO_COLOR', () => {
  assert.equal(formatStatus('[error] apps/web/.env: missing PORT', { env: {}, isTTY: true }),
    '\x1b[31m[error]\x1b[0m apps/web/.env: missing PORT');
  assert.equal(formatStatus('[ok] ready', { env: { FORCE_COLOR: '1' }, isTTY: false }),
    '\x1b[32m[ok]\x1b[0m ready');
  assert.equal(formatStatus('[success] deleted files: fixture', { env: {}, isTTY: true }),
    '\x1b[32m[success]\x1b[0m deleted files: fixture');
  for (const env of [{}, { FORCE_COLOR: '0' }, { FORCE_COLOR: '1', NO_COLOR: '1' }]) {
    assert.equal(formatStatus('[warn] missing', { env, isTTY: false }), '[warn] missing');
  }
});

test('QA env validation selects its own template, detects missing/empty keys and redacts secrets', async (t) => {
  const root = await fixture(t);
  const messages = [];
  const options = { mode: 'qa', log: (line) => messages.push(line) };
  await put(root, 'infra/local/.env.qa.example', 'TOKEN=\nOPTION=default');
  await validateEnvironment(root, { ...options, templatesOnly: true });
  await assert.rejects(validateEnvironment(root, options), /failed/);
  await put(root, 'infra/local/.env.qa', 'TOKEN=super-secret');
  await assert.rejects(validateEnvironment(root, options), /failed/);
  await put(root, 'infra/local/.env.qa', 'TOKEN=super-secret\nOPTION=');
  await validateEnvironment(root, options);
  await assert.rejects(validateEnvironment(root, { ...options, requireValues: true }), /failed/);
  await put(root, 'infra/local/.env.qa', 'TOKEN=super-secret\nOPTION=ready');
  await validateEnvironment(root, { ...options, requireValues: true });
  assert.ok(!messages.join('\n').includes('super-secret'));
  assert.ok(messages.some((line) => line.includes('missing variables OPTION')));
});

test('port validation and listener parsing only select matching listening endpoints', () => {
  for (const value of [0, 65536, '-1', '3000; exit', '3.1']) assert.throws(() => parsePort(value));
  assert.equal(parsePort('3000'), 3000);
  assert.deepEqual(parseListeners(' TCP 127.0.0.1:3000 0.0.0.0:0 LISTENING 321\n' +
    ' TCP [::]:3000 [::]:0 LISTENING 321\n TCP 0.0.0.0:13000 0.0.0.0:0 LISTENING 999', 3000, 'win32'), [321]);
  assert.deepEqual(parseListeners('LISTEN 0 511 [::]:3000 [::]:* users:(("node",pid=321,fd=1))', 3000, 'linux'), [321]);
  assert.equal(stopCommand(321, 'win32'), 'Stop-Process -Id 321');
  assert.equal(stopCommand(321, 'linux'), 'kill -TERM 321');
  assert.equal(stopCommand(4), null);
  assert.equal(stopCommand(-1), null);
});

test('live occupied port fails, reports the listener and leaves the process running', async (t) => {
  const server = net.createServer((socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => server.listening && server.close());
  const port = server.address().port;
  assert.equal(await portAvailable(port), false);
  const messages = [];
  await assert.rejects(checkPorts([port], { log: (line) => messages.push(line) }), /occupied/);
  assert.ok(messages.some((line) => line.includes(`PID ${process.pid}`)), messages.join('\n'));
  assert.ok(messages.some((line) => line.includes(stopCommand(process.pid))));
  assert.equal(server.listening, true);
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await portAvailable(port), true);
});

test('certificate validation checks CA signature, key, SAN and validity using temporary certificates', async (t) => {
  const root = await fixture(t);
  const openssl = process.env.OPENSSL_BIN ?? (process.platform === 'win32'
    ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe' : 'openssl');
  const run = (args) => execute(openssl, args, { cwd: root, windowsHide: true });
  await run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem',
    '-subj', '/CN=Modulon Test CA', '-days', '2', '-addext', 'basicConstraints=critical,CA:TRUE']);
  await run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'leaf.key', '-out', 'leaf.csr',
    '-subj', '/CN=localhost']);
  await put(root, 'extensions.cnf', 'basicConstraints=CA:FALSE\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth');
  await run(['x509', '-req', '-in', 'leaf.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial',
    '-out', 'leaf.pem', '-days', '1', '-extfile', 'extensions.cnf']);
  const options = { cert: path.join(root, 'leaf.pem'), key: path.join(root, 'leaf.key'), ca: path.join(root, 'ca.pem') };
  assert.ok(await validateCertificates(options));
  await assert.rejects(validateCertificates({ ...options, key: path.join(root, 'ca.key') }), /does not match/);
  await assert.rejects(validateCertificates({ ...options, hosts: ['wrong.example'] }), /SAN/);
  await assert.rejects(validateCertificates({ ...options, ca: options.cert }), /not signed/);
  await assert.rejects(validateCertificates({ ...options, now: Date.now() + 4 * 86400000 }), /validity/);
  await assert.rejects(validateCertificates({ ...options, minDays: 3 }), /expires/);
});
