import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DevInfra, infraPlan } from '../../scripts/dev-infra.mjs';

const env = { ENV_MODE: 'dev', STACK_NAME: 'fixturedev' };
function config() { return { name: 'fixturedev', services: { db: {}, auth: {}, s3: {}, s3console: {} },
  volumes: Object.fromEntries(['postgres-data', 'seaweed-data', 's3console-data'].map(key => [key, { name: `fixturedev-${key}` }])) }; }

async function fixture(t, { foreign = false, unowned = false, qa = false } = {}) {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(path.join(parent, 'modulon-infra-'));
  t.after(async () => { assert.equal(path.dirname(await realpath(root)), parent); assert.ok(path.basename(root).startsWith('modulon-infra-')); await rm(root, { recursive: true, force: true }); });
  await mkdir(path.join(root, 'infra/local'), { recursive: true });
  await writeFile(path.join(root, 'infra/local/.env.dev'), 'ENV_MODE=dev\nSTACK_NAME=fixturedev\n');
  if (qa) await writeFile(path.join(root, 'infra/local/.env.qa'), 'STACK_NAME=fixturedev\n');
  const calls = [];
  const liveCalls = [];
  let deleted = false;
  const docker = async (args, options) => {
    calls.push(args);
    if (options?.live) liveCalls.push(args);
    if (args.includes('config')) return JSON.stringify(config());
    if (args[0] === 'volume' && args[1] === 'ls') return deleted ? '' : 'fixturedev-postgres-data\n';
    if (args[0] === 'volume' && args[1] === 'inspect') return JSON.stringify([{ Driver: 'local', Labels: {
      'com.docker.compose.project': unowned ? 'foreign' : 'fixturedev', 'com.docker.compose.volume': 'postgres-data' } }]);
    if (args[0] === 'ps') return 'fixture-id\n';
    if (args[0] === 'inspect') return JSON.stringify([{ Config: { Labels: { 'com.docker.compose.project': foreign ? 'foreign' : 'fixturedev' } } }]);
    if (args.includes('down')) deleted = true;
    return '';
  };
  return { calls, liveCalls, infra: new DevInfra({ root, docker, log: () => {} }) };
}

test('reset plan refuses QA, foreign/external/custom-driver volumes and unexpected services', () => {
  assert.equal(infraPlan(env, config()).volumes.length, 3);
  assert.throws(() => infraPlan({ ...env, ENV_MODE: 'qa' }, config()));
  for (const change of [volume => { volume.external = true; }, volume => { volume.name = 'foreign-data'; },
    volume => { volume.driver_opts = { device: '/private' }; }]) {
    const value = config(); change(value.volumes['postgres-data']); assert.throws(() => infraPlan(env, value));
  }
  const value = config(); value.services.web = {}; assert.throws(() => infraPlan(env, value));
});

test('delete verifies ownership before scoped Compose down with all profiles and volumes', async t => {
  const { infra, calls } = await fixture(t);
  await infra.delete();
  const down = calls.find(args => args.includes('down'));
  assert.ok(down.includes('--project-name') && down.includes('fixturedev'));
  assert.ok(down.includes('--profile') && down.includes('tools'));
  assert.deepEqual(down.slice(-3), ['down', '--volumes', '--remove-orphans']);
  assert.ok(calls.findIndex(args => args[0] === 'inspect') < calls.indexOf(down));
  assert.ok(!calls.some(args => args.includes('prune')));
});

test('foreign consumers, unowned volumes and identical QA project prevent all destructive commands', async t => {
  for (const options of [{ foreign: true }, { unowned: true }, { qa: true }]) {
    const { infra, calls } = await fixture(t, options);
    await assert.rejects(infra.delete());
    assert.ok(!calls.some(args => args.includes('down')));
  }
});

test('infra up builds only infrastructure, includes console and waits for health without deletion', async t => {
  const { infra, calls } = await fixture(t);
  await infra.up();
  const up = calls.find(args => args.includes('up'));
  for (const value of ['--profile', 'tools', '--build', '--wait', '--wait-timeout']) assert.ok(up.includes(value));
  assert.ok(!calls.some(args => args.includes('down') || args.includes('--volumes')));
});

test('Compose lifecycle output is live while private configuration stays captured', async t => {
  const { infra, liveCalls } = await fixture(t);
  await infra.up({ build: false });
  await infra.down();
  await infra.delete();
  assert.deepEqual(liveCalls.map(args => args.includes('up') ? 'up' : 'down'), ['up', 'down', 'down']);
  assert.ok(liveCalls[0].includes('--no-build'));
  assert.ok(!liveCalls.some(args => args.includes('config') || args.includes('inspect')));
});

test('invalid CLI actions and flags fail before Docker can mutate anything', async () => {
  const execute = promisify(execFile);
  for (const args of [[], ['unknown'], ['up', '--unknown'], ['up', '--no-build', '--no-build'],
    ['down', '--no-build'], ['delete', '--no-build'], ['status', 'extra'], ['logs', '--follow']]) {
    await assert.rejects(execute(process.execPath, ['scripts/dev-infra.mjs', ...args], { windowsHide: true }), error => {
      assert.equal(error.code, 1);
      assert.ok(error.stderr.includes('Usage:'));
      assert.ok(!error.stderr.includes('Docker operation failed'));
      return true;
    });
  }
});
