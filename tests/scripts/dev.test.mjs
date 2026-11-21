import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkDockerEngine, checkDockerContainers, containerProblems, parseComposeRows } from '../../scripts/check-docker.mjs';
import { validateDevDatabaseTargets } from '../../scripts/check-dev-databases.mjs';
import { devPorts } from '../../scripts/check-ports.mjs';
import { webEnvironment } from '../../scripts/web.mjs';

const execute = promisify(execFile);
const quiet = () => {};
const services = ['db', 'auth', 's3'];
const healthy = services.map(Service => ({ Service, Project: 'fixturedev', State: 'running', Health: 'healthy' }));

async function fixture(t) {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(path.join(parent, 'modulon-dev-'));
  t.after(async () => {
    assert.equal(path.dirname(await realpath(root)), parent);
    assert.ok(path.basename(root).startsWith('modulon-dev-'));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

test('Docker Engine check fails closed without disclosing raw daemon errors', async () => {
  await checkDockerEngine({ execute: async args => { assert.equal(args[0], 'info'); return '"fixture-version"'; }, log: quiet });
  for (const result of ['', 'null', '""', 'not-json']) {
    await assert.rejects(checkDockerEngine({ execute: async () => result, log: quiet }), /^Error: ERROR DOCKER ENGINE IS NOT WORKING$/);
  }
  await assert.rejects(checkDockerEngine({ execute: async () => { throw Error('private diagnostic'); }, log: quiet }), /^Error: ERROR DOCKER ENGINE IS NOT WORKING$/);
});

test('container checks require each service running and healthy in the owning project', () => {
  assert.deepEqual(containerProblems(healthy, services, 'fixturedev'), []);
  assert.deepEqual(parseComposeRows(JSON.stringify(healthy)), healthy);
  assert.deepEqual(parseComposeRows(healthy.map(row => JSON.stringify(row)).join('\n')), healthy);
  assert.deepEqual(containerProblems(healthy, services, 'anotherproject'), services.map(name => `${name}=missing`));
  assert.deepEqual(containerProblems([], ['db'], 'fixturedev'), ['db=missing']);
  assert.deepEqual(containerProblems([{ ...healthy[0], State: 'exited' }], ['db'], 'fixturedev'), ['db=not-running']);
  for (const Health of ['starting', 'unhealthy', '']) {
    assert.deepEqual(containerProblems([{ ...healthy[0], Health }], ['db'], 'fixturedev'), ['db=not-healthy']);
  }
  assert.throws(() => parseComposeRows('[null]'));
});

test('container command scopes Compose to DEV and distinguishes status failures from Engine failure', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'infra/local'), { recursive: true });
  await writeFile(path.join(root, 'infra/local/.env.dev'), 'ENV_MODE=dev\nSTACK_NAME=fixturedev\n');
  const calls = [];
  const fakeDocker = async args => {
    calls.push(args);
    return args.at(-1) === '--services' ? services.join('\n') : JSON.stringify(healthy);
  };
  await checkDockerContainers({ root, execute: fakeDocker, log: quiet });
  assert.ok(calls.every(args => args[args.indexOf('--project-name') + 1] === 'fixturedev'));
  assert.ok(calls[1].includes('--all'));
  await assert.rejects(checkDockerContainers({ root, log: quiet, execute: async args => args.at(-1) === '--services' ? 'db' : '[]' }), /ERROR DOCKER CONTAINERS ARE NOT READY: db=missing/);
  await assert.rejects(checkDockerContainers({ root, log: quiet, execute: async () => { throw Error('private raw output'); } }), error => error.message.includes('ERROR DOCKER CONTAINERS CANNOT BE VERIFIED') && !error.message.includes('private'));
});

test('DEV ports include all host services, inherited overrides and optional queue bridge', () => {
  assert.deepEqual(devPorts({}, {}), [3000, 8010]);
  assert.deepEqual(devPorts({ PYWORKER_API_TOKEN: "configured" }, {}), [3000, 8010, 8011]);
  assert.deepEqual(devPorts({ PORT: '3001', PYWORKER_QUEUE_BRIDGE_PORT: '8011' }, { PYWORKER_PORT: '8012' }, { PORT: '3002' }), [3002, 8012, 8011]);
  assert.deepEqual(devPorts({ PORT: '5555' }, {}), [5555, 8010]);
  assert.throws(() => devPorts({ PORT: '8010' }, {}), /distinct ports/);
  assert.throws(() => devPorts({}, { PYWORKER_PORT: 'invalid' }), /Port must/);
});

test('automatic migrations reject remote or mismatched DEV database targets and hidden overrides', () => {
  const infra = { ENV_MODE: 'dev', DB_PORT: '5432', DB_APP_DATABASE_NAME: 'fixtureapp', DB_APP_USERNAME: 'appuser', DB_QUEUE_DATABASE_NAME: 'fixturequeue', DB_QUEUE_USERNAME: 'queueuser' };
  const app = 'postgresql://appuser:fixture-password@127.0.0.1:5432/fixtureapp?schema=public';
  const web = { DATABASE_URL: app, QUEUE_DATABASE_URL: 'postgresql://queueuser:fixture-password@localhost:5432/fixturequeue' };
  validateDevDatabaseTargets(infra, { DATABASE_URL: app }, web);
  for (const DATABASE_URL of [app.replace('127.0.0.1', 'external.example'), app.replace('5432', '5433'), app.replace('fixtureapp', 'anotherdb'), app + '&host=external.example', app + '&schema=another', app + '&options=unsafe']) {
    assert.throws(() => validateDevDatabaseTargets(infra, { DATABASE_URL: app }, web, { DATABASE_URL }), error => !error.message.includes('fixture-password'));
  }
  assert.throws(() => validateDevDatabaseTargets({ ...infra, ENV_MODE: 'qa' }, { DATABASE_URL: app }, web), /ENV_MODE=dev/);
});

test('terminal clear produces no escape sequences in redirected output', async () => {
  const { stdout } = await execute(process.execPath, ['scripts/clear-terminal.mjs']);
  assert.equal(stdout, '');
});

test('Web listener inherits the checked local port while respecting process overrides', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'apps/web'), { recursive: true });
  await writeFile(path.join(root, 'apps/web/.env'), 'PORT=3011\nAUTH_BASE_URL=http://localhost\n');
  assert.equal((await webEnvironment(root, {})).PORT, '3011');
  assert.equal((await webEnvironment(root, { PORT: '3012' })).PORT, '3012');
});

const pnpm = process.env.npm_execpath;
for (const failedStep of [undefined, 'check:docker', 'dev:queue:prepare', 'db:deploy', 'db:seed:prepared']) {
  test(`real pnpm dev graph ${failedStep ? `stops after ${failedStep}` : 'starts three services and leaves Studio available separately'}`, { skip: !pnpm, timeout: 30000 }, async t => {
    const root = await fixture(t);
    const original = JSON.parse(await readFile('package.json', 'utf8'));
    const scripts = { ...original.scripts };
    scripts.dev = scripts['dev:run'];
    const steps = ['terminal:clear', 'pyworker:prepare', 'validate:dev', 'check:dev-auth', 'validate:certs', 'check:docker', 'check:containers', 'check:dev-ports', 'preferences:sync', 'build:database', 'build:queue', 'build:monitoring', 'dev:queue:prepare', 'check:dev-databases', 'db:deploy', 'check:dev-databases', 'db:seed:prepared'];
    const background = ['dev:web', 'dev:pythonworker', 'dev:queue'];
    for (const name of [...new Set([...steps, ...background])]) scripts[name] = `node step.mjs ${name}`;
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ private: true, scripts }));
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n');
    for (const [directory, marker] of [['apps/web', 'dev:web'], ['apps/pyworker', 'dev:pythonworker'], ['packages/queue', 'dev:queue'], ['packages/database', 'db:studio']]) {
      await mkdir(path.join(root, directory), { recursive: true });
      await writeFile(path.join(root, directory, 'package.json'), JSON.stringify({ name: directory === 'packages/database' ? '@formiq/database' : 'fixture-' + path.basename(directory), private: true, scripts: { dev: `node ../../step.mjs ${marker}`, ...(directory === 'packages/database' ? { 'db:studio': `node ../../step.mjs ${marker}` } : {}) } }));
    }
    await writeFile(path.join(root, 'step.mjs'), 'import { appendFileSync } from "node:fs"; const name = process.argv[2]; appendFileSync(process.env.DEV_TRACE, name + "\\n"); console.log("fixture output " + name); if (process.env.FAIL_STEP === name) process.exit(7);');
    const trace = path.join(root, 'trace.log');
    const command = /\.[cm]?js$/.test(pnpm) ? process.execPath : pnpm;
    const prefix = command === process.execPath ? [pnpm] : [];
    let exit = 0;
    let output = '';
    try {
      const result = await execute(command, [...prefix, '--dir', root, 'run', 'dev'], { windowsHide: true, timeout: 25000, env: { ...process.env, DEV_TRACE: trace, FAIL_STEP: failedStep || '' } });
      output = result.stdout;
    } catch (error) { exit = error.code; }
    const observed = (await readFile(trace, 'utf8')).trim().split(/\r?\n/);
    if (failedStep) {
      assert.notEqual(exit, 0);
      assert.deepEqual(observed, steps.slice(0, steps.indexOf(failedStep) + 1));
    } else {
      assert.equal(exit, 0);
      assert.deepEqual(observed.slice(0, steps.length + 1), [...steps, 'terminal:clear']);
      assert.deepEqual(observed.slice(steps.length + 1).sort(), [...background].sort());
      for (const directory of ['apps/web', 'apps/pyworker', 'packages/queue']) {
        assert.ok(output.includes(`${directory} dev: fixture output`), `Missing streamed prefix: ${directory}`);
      }
      assert.ok(!output.includes('packages/database dev:'));
      await execute(command, [...prefix, '--dir', root, 'run', 'db:studio'], { windowsHide: true, timeout: 5000, env: { ...process.env, DEV_TRACE: trace, FAIL_STEP: '' } });
      assert.equal((await readFile(trace, 'utf8')).trim().split(/\r?\n/).at(-1), 'db:studio');
    }
  });
}
