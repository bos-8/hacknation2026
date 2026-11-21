import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { prepareDevQueue } from '../../scripts/queue-prepare.mjs';

async function fixture(t) {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(path.join(parent, 'modulon-queue-prepare-'));
  t.after(async () => { assert.equal(path.dirname(await realpath(root)), parent); assert.ok(path.basename(root).startsWith('modulon-queue-prepare-')); await rm(root, { recursive: true, force: true }); });
  const files = {
    'infra/local/.env.dev': 'ENV_MODE=dev\nDB_APP_DATABASE_NAME=app\nDB_APP_USERNAME=app\nDB_QUEUE_DATABASE_NAME=queue\nDB_QUEUE_USERNAME=queue\nDB_PORT=5432\n',
    'packages/database/.env': 'DATABASE_URL=postgresql://app:existing-local-password@localhost:5432/app\n',
    'apps/web/.env': 'DATABASE_URL=postgresql://app:existing-local-password@localhost:5432/app\nQUEUE_DATABASE_URL=postgresql://queue:existing-local-password@localhost:5432/queue\n',
  };
  for (const [file, contents] of Object.entries(files)) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), contents); }
  return { root, files };
}

test('queue preparation uses the verified existing database and leaves every env unchanged', async t => {
  const { root, files } = await fixture(t);
  const calls = [];
  await prepareDevQueue({ root, inherited: {}, log: () => {}, createQueue: connection => {
    assert.equal(new URL(connection).pathname, '/queue');
    return { start: async () => calls.push('start'), stop: async () => calls.push('stop') };
  } });
  assert.deepEqual(calls, ['start', 'stop']);
  for (const [file, contents] of Object.entries(files)) assert.equal(await readFile(path.join(root, file), 'utf8'), contents);
});

test('queue preparation rejects remote/inherited target changes before opening the queue', async t => {
  const { root } = await fixture(t);
  let created = false;
  await assert.rejects(prepareDevQueue({ root, inherited: { QUEUE_DATABASE_URL: 'postgresql://queue:private@remote.invalid/queue' }, log: () => {},
    createQueue: () => { created = true; throw Error('Unexpected connection'); },
  }), /targets must match/);
  assert.equal(created, false);
});

test('queue preparation closes failed setup and hides private errors', async t => {
  const { root } = await fixture(t);
  let stopped = false;
  await assert.rejects(prepareDevQueue({ root, inherited: {}, log: () => {}, createQueue: () => ({
    start: async () => { throw Error('private-password'); }, stop: async () => { stopped = true; },
  }) }), error => /preparation failed/.test(error.message) && !error.message.includes('private-password'));
  assert.equal(stopped, true);
});
