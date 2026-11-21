import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { Qa, validateQaIdentity, runtimeEnvironments, qaRuntimeVariables, qaPortConflicts, migrateQaHosts } from '../../scripts/qa.mjs';

async function fixture(t) {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(path.join(parent, 'modulon-qa-'));
  t.after(async () => {
    assert.equal(path.dirname(await realpath(root)), parent);
    assert.ok(path.basename(root).startsWith('modulon-qa-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'infra/local'), { recursive: true });
  await writeFile(path.join(root, 'infra/local/.env.qa.example'), await readFile('infra/local/.env.qa.example'));
  const calls = [];
  const execute = async args => {
    calls.push(args);
    if (args[0] === 'info') return '"fixture-version"';
    if (args[0] === 'context') return 'npipe:////./pipe/fixture';
    if (args[0] === 'image') return 'sha256:fixture';
    throw Error('Unexpected Docker call');
  };
  const stream = async args => { calls.push(args); };
  const qa = new Qa({ root, execute, stream, log: () => {} });
  return { root, qa, calls };
}

test('QA uses one env, removes obsolete generated files, preserves comments/credentials and separates process secrets', async t => {
  const { qa, root } = await fixture(t);
  const obsolete = ['web', 'queue', 'pyworker', 'maintenance', 'nginx.template'];
  for (const suffix of obsolete) await writeFile(path.join(root, qa.file + '.' + suffix), 'obsolete generated file');
  await qa.init();
  const first = parseEnv(await readFile(path.join(root, qa.file), 'utf8'));
  await qa.init();
  const second = parseEnv(await readFile(path.join(root, qa.file), 'utf8'));
  assert.deepEqual(first, second);
  assert.notEqual(first.AUTH_SECRET, first.PYWORKER_API_TOKEN);
  const bundles = runtimeEnvironments(first);
  assert.deepEqual(Object.keys(bundles.maintenance).sort(), ['DATABASE_URL', 'QUEUE_DATABASE_URL']);
  assert.ok(!('DATABASE_URL' in bundles.pyworker));
  assert.ok(!('AUTH_SECRET' in bundles.queue));
  assert.ok(!('DB_ADMIN_PASSWORD' in bundles.web));
  assert.ok(!('PYWORKER_API_TOKEN' in bundles.web));
  assert.equal(bundles.web.OPENAI_API_KEY, '');
  const configured = runtimeEnvironments({ ...first, OPENAI_API_KEY: 'test-openai-key' });
  assert.equal(configured.web.OPENAI_API_KEY, 'test-openai-key');
  for (const service of ['queue', 'pyworker', 'maintenance']) assert.ok(!('OPENAI_API_KEY' in configured[service]));
  assert.equal(bundles.queue.PYWORKER_API_TOKEN, bundles.pyworker.PYWORKER_API_TOKEN);
  assert.equal(new URL(bundles.web.DATABASE_URL).hostname, 'db');
  assert.equal(new URL(bundles.queue.QUEUE_DATABASE_URL).hostname, 'db');
  assert.equal(bundles.pyworker.PYWORKER_ALLOW_NETWORK_BIND, 'true');
  for (const suffix of obsolete) await assert.rejects(access(path.join(root, qa.file + '.' + suffix)), { code: 'ENOENT' });
  const text = await readFile(path.join(root, qa.file), 'utf8');
  assert.ok(text.includes('# ===[STORAGE]') && text.includes('# ===[WEB - NEXT.JS]') && text.includes('# ===[PYTHON WORKER]'));
});

test('QA rejects the DEV identity before Docker mutations', () => {
  assert.throws(() => validateQaIdentity({ ENV_MODE: 'dev', STACK_NAME: 'formiqqa' }));
  assert.throws(() => validateQaIdentity({ ENV_MODE: 'qa', STACK_NAME: 'formiqdev' }));
  assert.throws(() => validateQaIdentity({ ENV_MODE: 'qa', STACK_NAME: 'custom' }, { STACK_NAME: 'custom' }));
  validateQaIdentity({ ENV_MODE: 'qa', STACK_NAME: 'formiqqa' });
});

test('QA defaults match DEV public hosts and origins while keeping separate identity and cookies', async () => {
  const dev = parseEnv(await readFile('infra/local/.env.dev.example', 'utf8'));
  const qa = parseEnv(await readFile('infra/local/.env.qa.example', 'utf8'));
  for (const key of ['APP_HOST', 'WEB_HOST', 'AUTH_HOST', 'AUTH_ADMIN_HOST', 'S3_HOST', 'S3CONSOLE_HOST']) {
    assert.equal(qa[key], dev[key], key);
  }
  for (const key of ['WEB_HTTPS_PORT', 'AUTH_LOCAL_PORT', 'DB_PORT', 'S3_PORT', 'S3CONSOLE_PORT']) assert.notEqual(qa[key], dev[key]);
  assert.notEqual(qa.STACK_NAME, dev.STACK_NAME);
  assert.notEqual(qa.ENV_MODE, dev.ENV_MODE);
  assert.equal(qa.AUTH_COOKIE_PREFIX, 'formiq_qa_auth');
});

test('QA init migrates legacy public origins without changing secrets, ports or storage identity', async t => {
  const { qa, root } = await fixture(t);
  await qa.init();
  const file = path.join(root, qa.file);
  const original = parseEnv(await readFile(file, 'utf8'));
  const legacy = { ...original, APP_HOST: 'qa.modulon.local', WEB_HOST: 'web-qa.modulon.local',
    APP_PUBLIC_URL: 'https://qa.modulon.local:8443', AUTH_HOST: 'auth-qa.modulon.local',
    AUTH_PUBLIC_URL: 'https://auth-qa.modulon.local:8443', AUTH_ADMIN_HOST: 'authconsole-qa.modulon.local',
    AUTH_ADMIN_PUBLIC_URL: 'https://authconsole-qa.modulon.local:8443', S3_HOST: 's3-qa.modulon.local',
    S3CONSOLE_HOST: 's3console-qa.modulon.local' };
  await writeFile(file, Object.entries(legacy).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n'));
  await qa.init();
  const migrated = parseEnv(await readFile(file, 'utf8'));
  assert.equal(migrated.APP_PUBLIC_URL, 'https://localhost:3100');
  assert.equal(migrated.AUTH_PUBLIC_URL, 'https://localhost:9443');
  assert.equal(migrated.AUTH_ADMIN_PUBLIC_URL, 'https://localhost:9443');
  const publicKeys = new Set(['APP_HOST', 'WEB_HOST', 'APP_PUBLIC_URL', 'AUTH_HOST', 'AUTH_ADMIN_HOST',
    'AUTH_PUBLIC_URL', 'AUTH_ADMIN_PUBLIC_URL', 'S3_HOST', 'S3CONSOLE_HOST']);
  for (const key of Object.keys(legacy)) if (!publicKeys.has(key)) assert.equal(migrated[key], legacy[key], key);
  await qa.init();
  assert.deepEqual(parseEnv(await readFile(file, 'utf8')), migrated);
  assert.deepEqual(migrateQaHosts({ APP_HOST: 'custom.example', APP_PUBLIC_URL: 'https://custom.example:8443' }),
    { APP_HOST: 'custom.example', APP_PUBLIC_URL: 'https://custom.example:8443' });
});

test('QA validates maintenance configuration and rejects foreign volumes and extra runtime secrets', async t => {
  const { qa, root } = await fixture(t);
  await qa.init();
  const env = parseEnv(await readFile(path.join(root, qa.file), 'utf8'));
  const config = { name: env.STACK_NAME, services: Object.fromEntries(Object.entries(runtimeEnvironments(env)).map(([name, environment]) => [name, { image: name + ':qa', environment }])),
    volumes: { postgres: { name: env.STACK_NAME + '-postgres' } } };
  qa.execute = async args => {
    assert.ok(args.includes('--profile') && args.includes('maintenance'));
    return JSON.stringify(config);
  };
  await qa.context();
  config.volumes.postgres.name = 'formiqdev-postgres';
  await assert.rejects(qa.context(), /volumes must belong/);
  config.volumes.postgres.name = env.STACK_NAME + '-postgres';
  config.volumes.postgres.external = true;
  await assert.rejects(qa.context(), /volumes must belong/);
  config.volumes.postgres.external = false;
  config.services.pyworker.environment.AUTH_SECRET = 'unexpected';
  await assert.rejects(qa.context(), /Unexpected QA pyworker runtime environment/);
});

test('QA derives encoded database URLs in memory without copying infrastructure credentials into services', () => {
  const password = "test$#pass@:/word";
  const env = { DB_APP_DATABASE_NAME: 'app', DB_APP_USERNAME: 'app_user', DB_APP_PASSWORD: password,
    DB_QUEUE_DATABASE_NAME: 'queue', DB_QUEUE_USERNAME: 'queue_user', DB_QUEUE_PASSWORD: 'queue#password' };
  const runtime = qaRuntimeVariables(env);
  assert.deepEqual(Object.keys(runtime), ['QA_DATABASE_URL', 'QA_QUEUE_DATABASE_URL']);
  assert.equal(decodeURIComponent(new URL(runtime.QA_DATABASE_URL).password), password);
  assert.equal(new URL(runtime.QA_DATABASE_URL).hostname, 'db');
  assert.equal(decodeURIComponent(new URL(runtime.QA_QUEUE_DATABASE_URL).password), env.DB_QUEUE_PASSWORD);
});

test('QA port conflicts permit its own running bindings but block other projects', () => {
  const config = { name: 'qa', services: { web: { ports: [{ published: '443' }] }, postgres: { ports: [{ published: '5432' }] } } };
  const available = new Map([[443, false], [5432, false]]);
  const row = { Project: 'qa', State: 'running', Publishers: [{ Protocol: 'tcp', PublishedPort: 443 }] };
  assert.deepEqual(qaPortConflicts(config, [row], available), [5432]);
  assert.deepEqual(qaPortConflicts(config, [{ ...row, Project: 'dev' }], available), [443, 5432]);
  assert.deepEqual(qaPortConflicts(config, [{ ...row, State: 'exited' }], available), [443, 5432]);
});

test('image builds pass only public arguments and never deploy or start services', async t => {
  const { qa, calls, root } = await fixture(t);
  await qa.init();
  const env = parseEnv(await readFile(path.join(root, qa.file), 'utf8'));
  await qa.build('web');
  const args = calls.find(args => args[0] === 'build');
  assert.ok(args.includes('--target') && args.includes('web'));
  assert.ok(!args.some(value => value.includes(env.AUTH_SECRET) || value.includes(env.DB_APP_PASSWORD)));
  assert.ok(!calls.some(args => args[0] === 'compose'));
  await assert.rejects(qa.build('unregistered'));
});

test('deploy and start remain separate, with no implicit build or migration during start', async t => {
  const { qa, calls } = await fixture(t);
  const context = { args: ['compose', '--project-name', 'qa'], runtime: {}, config: { services: Object.fromEntries(['db','auth','s3','web','pyworker','queue','maintenance'].map(name => [name, { image: name + ':qa' }])) } };
  qa.check = async () => context;
  await qa.deploy();
  assert.ok(calls.some(args => args.includes('scripts/qa-maintenance.mjs') && args.at(-1) === 'deploy'));
  assert.ok(!calls.some(args => args.includes('build')));
  calls.length = 0;
  await qa.start();
  assert.ok(calls.some(args => args.includes('scripts/qa-maintenance.mjs') && args.at(-1) === 'verify'));
  assert.ok(!calls.some(args => args.at(-1) === 'deploy' || args.includes('build')));
  assert.ok(calls.filter(args => args.includes('up')).every(args => args.includes('--no-build') && args.includes('never')));
  calls.length = 0;
  qa.check = async () => { throw Error('ERROR QA PORTS ARE OCCUPIED'); };
  await assert.rejects(qa.start(), /PORTS ARE OCCUPIED/);
  assert.deepEqual(calls, []);
});

test('QA CLI aliases keep build, deploy and start explicit and aggregate only leaf build scripts', async () => {
  const { scripts } = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(scripts['qa:start'], 'node scripts/qa.mjs start');
  assert.equal(scripts['qa:deploy'], 'node scripts/qa.mjs deploy');
  assert.match(scripts['qa:up'], /qa:build && pnpm qa:deploy && pnpm qa:start$/);
  const pattern = new RegExp(scripts['qa:build'].slice('pnpm run "/'.length, -2));
  const selected = Object.keys(scripts).filter(name => pattern.test(name));
  assert.equal(selected.length, 7);
  assert.ok(!selected.includes('qa:build'));
});
