import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { S3Console, consoleEnvironment, S3CONSOLE_IMAGE, S3CONSOLE_QA_IMAGE } from '../../scripts/s3console.mjs';

async function fixture(t) {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(path.join(parent, 'modulon-console-'));
  t.after(async () => {
    assert.equal(path.dirname(await realpath(root)), parent);
    assert.ok(path.basename(root).startsWith('modulon-console-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'infra/local'), { recursive: true });
  const env = { ENV_MODE: 'dev', STACK_NAME: 'formiqdev', INSTANCE_INDEX: '0', S3_ADMIN_ACCESS_KEY: 'operator-key',
    S3_ADMIN_SECRET_KEY: "operator$#secret'preserved", S3_APP_ACCESS_KEY: 'application-key', S3_APP_SECRET_KEY: 'app-only-secret',
    S3_AVATAR_ACCESS_KEY: 'avatar-key', DB_ADMIN_PASSWORD: 'db-only-secret',
    S3CONSOLE_ADMIN_USERNAME: 'admin', S3CONSOLE_ADMIN_PASSWORD: "independent-admin-password$#secret'preserved" };
  await writeFile(path.join(root, 'infra/local/.env.dev'), Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n'));
  const bundle = consoleEnvironment(env);
  const config = { name: env.STACK_NAME, services: { s3console: { container_name: 'formiqdev-s3console-0', image: S3CONSOLE_IMAGE,
    user: '1000:1000', entrypoint: ['/usr/bin/weed'],
    command: ['admin', '-master=s3:9333', '-ip=0.0.0.0', '-port=8080', '-port.legacy=0', '-dataDir=/data/admin', '-iceberg.port=0', '-lance.port=0'],
    volumes: [{ type: 'volume', source: 's3console-data', target: '/data' }],
    read_only: true, environment: bundle, ports: [{ host_ip: '127.0.0.1', published: '8090', target: 8080, protocol: 'tcp' }] } },
    volumes: { 's3console-data': { name: 'formiqdev-s3console' } } };
  const rows = [{ Project: env.STACK_NAME, Service: 's3', State: 'running', Health: 'healthy' }];
  const calls = [];
  const execute = async args => {
    calls.push(args);
    if (args[0] === 'info') return '"fixture"';
    if (args[0] === 'context') return 'npipe:////./pipe/fixture';
    if (args.includes('config')) return JSON.stringify(config);
    if (args.includes('ps')) return JSON.stringify(rows);
    return '';
  };
  const console = new S3Console({ root, execute, available: async () => true, log: () => {} });
  await console.init();
  return { root, console, calls, config, rows, env };
}

test('console uses the owning env, preserves credentials and removes its obsolete generated file', async t => {
  const { root, console, env } = await fixture(t);
  const first = await readFile(path.join(root, console.file), 'utf8');
  assert.ok(first.includes(env.S3_ADMIN_SECRET_KEY));
  assert.ok(first.includes('# ---[CONSOLE]') && first.includes('S3CONSOLE_PORT=8090'));
  assert.ok(first.includes('S3CONSOLE_HOST=localhost'));
  const legacy = path.join(root, console.file + '.s3console');
  await writeFile(legacy, 'obsolete generated credentials');
  await console.init();
  await assert.rejects(access(legacy), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(root, console.file), 'utf8'), first);
  await console.context();
  const bundle = consoleEnvironment(env);
  assert.ok(!Object.values(bundle).includes(env.S3_APP_SECRET_KEY) && !Object.values(bundle).includes(env.DB_ADMIN_PASSWORD));
  assert.ok(!Object.values(bundle).includes(env.S3_ADMIN_SECRET_KEY));
  assert.throws(() => consoleEnvironment({ ...env, S3CONSOLE_ADMIN_PASSWORD: '' }), /value hidden/);
  assert.throws(() => consoleEnvironment({ ...env, S3CONSOLE_ADMIN_PASSWORD: 'a\nb'.repeat(32) }), /value hidden/);
});

test('console rejects unsafe mode, port, network exposure and unrelated runtime secrets', async t => {
  assert.throws(() => new S3Console({ mode: 'prod' }), /mode/);
  assert.throws(() => new S3Console({ port: '8090x' }), /port/);
  const { console, config } = await fixture(t);
  config.services.s3console.ports[0].host_ip = '0.0.0.0';
  await assert.rejects(console.context(), /Unsafe/);
  config.services.s3console.ports[0].host_ip = '127.0.0.1';
  config.services.s3console.environment.DATABASE_URL = 'forbidden';
  await assert.rejects(console.context(), /Unexpected/);
});

test('console requires exactly one owned named data volume and rejects foreign or extra mounts', async t => {
  const { console, config } = await fixture(t);
  await console.context();
  config.volumes['s3console-data'].name = 'another-project-s3console';
  await assert.rejects(console.context(), /Unsafe/);
  config.volumes['s3console-data'].name = 'formiqdev-s3console';
  config.services.s3console.volumes.push({ type: 'volume', source: 's3console-data', target: '/extra' });
  await assert.rejects(console.context(), /Unsafe/);
  config.services.s3console.volumes.pop();
  config.services.s3console.volumes[0].type = 'bind';
  await assert.rejects(console.context(), /Unsafe/);
});

test('console reads port from STORAGE and accepts an explicit CLI port override', async t => {
  const { root, console, config } = await fixture(t);
  const file = path.join(root, console.file);
  const text = await readFile(file, 'utf8');
  await writeFile(file, text.replace('S3CONSOLE_PORT=8090', 'S3CONSOLE_PORT=8092'));
  config.services.s3console.ports[0].published = '8092';
  await console.context();
  assert.equal(console.port, 8092);
  console.portOverride = 8093;
  config.services.s3console.ports[0].published = '8093';
  await console.context();
  assert.equal(console.port, 8093);
  await writeFile(file, text.replace('S3CONSOLE_PORT=8090', 'S3CONSOLE_PORT=invalid'));
  console.portOverride = undefined;
  await assert.rejects(console.context(), /port/);
});

test('console hostname rejects proxy configuration injection and is not passed to the Admin process', async t => {
  const { root, console } = await fixture(t);
  const file = path.join(root, console.file);
  const text = await readFile(file, 'utf8');
  await writeFile(file, text.replace('S3CONSOLE_HOST=localhost', 'S3CONSOLE_HOST=bad;host'));
  await assert.rejects(console.context(), /S3CONSOLE_HOST/);
  await writeFile(file, text.replace('S3CONSOLE_HOST=localhost', 'S3CONSOLE_HOST=custom.modulon.local'));
  const { bundle } = await console.settings();
  assert.equal(console.host, 'custom.modulon.local');
  assert.ok(!('S3CONSOLE_HOST' in bundle));
});

test('DEV permits a version tag, rejects latest, and QA retains required digest pinning', async t => {
  const { root, console } = await fixture(t);
  const file = path.join(root, console.file);
  const original = await readFile(file, 'utf8');
  await console.settings();
  assert.equal(console.image, 'chrislusf/seaweedfs:4.51');
  await writeFile(file, original.replace(S3CONSOLE_IMAGE, 'chrislusf/seaweedfs:latest'));
  await assert.rejects(console.settings(), /explicit version/);
  await writeFile(file, original);
  const qaFile = path.join(root, 'infra/local/.env.qa');
  const qaEnv = original.replace('ENV_MODE="dev"', 'ENV_MODE="qa"').replace('STACK_NAME="formiqdev"', 'STACK_NAME="modulonpocqa"');
  await writeFile(qaFile, qaEnv);
  const qa = new S3Console({ root, mode: 'qa' });
  await assert.rejects(qa.settings(), /pinned by digest/);
  await writeFile(qaFile, qaEnv.replace(S3CONSOLE_IMAGE, S3CONSOLE_QA_IMAGE));
  await qa.settings();
  assert.equal(qa.image, S3CONSOLE_QA_IMAGE);
});

test('console migration replaces S3 Manager and generates stable independent Admin UI login credentials', async t => {
  const { root, console } = await fixture(t);
  const file = path.join(root, console.file);
  const previous = await readFile(file, 'utf8');
  await writeFile(file, previous.replace(/^S3CONSOLE_ADMIN_.*\n/gm, '')
    .replace(/^S3CONSOLE_IMAGE=.*$/m, 'S3CONSOLE_IMAGE=cloudlena/s3manager:v0.12.0@sha256:' + 'a'.repeat(64)) + 'S3CONSOLE_ALLOW_DELETE=true\n');
  await console.init();
  const first = parseEnv(await readFile(file, 'utf8'));
  assert.equal(first.S3CONSOLE_IMAGE, S3CONSOLE_IMAGE);
  assert.match(first.S3CONSOLE_ADMIN_PASSWORD, /^[a-f0-9]{64}$/);
  assert.notEqual(first.S3CONSOLE_ADMIN_PASSWORD, first.S3_ADMIN_SECRET_KEY);
  assert.ok(!('S3CONSOLE_ALLOW_DELETE' in first));
  await console.init();
  assert.deepEqual(parseEnv(await readFile(file, 'utf8')), first);
});

test('console start blocks busy ports and unhealthy storage before mutations, permits its own binding and starts only the console', async t => {
  const { console, calls, rows } = await fixture(t);
  console.available = async () => false;
  await assert.rejects(console.start(), /PORT IS OCCUPIED/);
  assert.ok(!calls.some(args => args.includes('up') || args.includes('stop')));
  rows.push({ Project: 'formiqdev', Service: 's3console', State: 'running', Publishers: [{ Protocol: 'tcp', PublishedPort: 8090 }] });
  await console.start();
  const up = calls.find(args => args.includes('up'));
  assert.equal(up.at(-1), 's3console');
  for (const flag of ['--no-deps', '--no-build', '--pull', 'never']) assert.ok(up.includes(flag));
  calls.length = 0;
  rows[0].Health = 'unhealthy';
  await assert.rejects(console.start(), /healthy/);
  assert.ok(!calls.some(args => args.includes('up')));
});
