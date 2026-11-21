import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pyworkerEnvironment } from '../../scripts/pyworker.mjs';
import { createPythonExecutor } from '../../scripts/lib/pyworker-client.mjs';

test('Python launcher resolves its own source/cache paths, respects overrides and excludes application credentials', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'modulon-python-'));
  t.after(async () => { assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)); await rm(root, { recursive: true, force: true }); });
  await mkdir(path.join(root, 'apps/pyworker'), { recursive: true });
  await writeFile(path.join(root, 'apps/pyworker/.env'), 'PYWORKER_PORT=8010\nPYWORKER_API_TOKEN=local-fixture\nDATABASE_URL=should-not-pass\n');
  const secrets = { DATABASE_URL: 'private', QUEUE_DATABASE_URL: 'private', AUTH_SECRET: 'private', S3_SECRET: 'private', KEYCLOAK_WEB_CLIENT_SECRET: 'private', SHADOW_DATABASE_URL: 'private', PGPASSFILE: 'private', CUSTOM_SECRET: 'private', PYWORKER_UNKNOWN_SECRET: 'private' };
  const env = await pyworkerEnvironment(root, { PYWORKER_PORT: '8123', PATH: 'fixture', PYWORKER_DATABASE_URL: 'explicit-fixture', ...secrets });
  assert.equal(env.PYWORKER_PORT, '8123'); assert.equal(env.PYWORKER_API_TOKEN, 'local-fixture');
  assert.equal(env.PYTHONPATH, path.join(root, 'apps/pyworker/src'));
  assert.equal(env.PYTHONPYCACHEPREFIX, path.join(root, 'apps/pyworker/.cache/pycache'));
  assert.equal(env.PATH, 'fixture');
  assert.equal(env.PYWORKER_DATABASE_URL, 'explicit-fixture');
  for (const key of Object.keys(secrets)) assert.equal(env[key], undefined, key);
});

test('Python direct dependencies agree with project metadata and have hash-locked versions', async () => {
  const base = 'apps/pyworker/';
  const [project, input, lock] = await Promise.all(['pyproject.toml','requirements.in','requirements.lock'].map(file => readFile(base + file, 'utf8')));
  for (const requirement of input.trim().split(/\r?\n/)) { assert.ok(project.includes(requirement)); assert.ok(lock.includes(requirement + ' \\')); }
  assert.match(lock, /--hash=sha256:[a-f0-9]{64}/);
});

test('Python task HTTP transport admits only the explicit QA service when opted in', async t => {
  const id = '019baf72-20b2-7000-8000-000000000001';
  const token = 'fixture-'.repeat(8);
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    requests++;
    assert.equal(url.hostname, 'pyworker');
    return new Response(JSON.stringify({ status: 'ok', executor: 'pyworker', job_id: id, attempt: 0, checksum: 'a'.repeat(64) }));
  });
  await assert.rejects(createPythonExecutor({ PYWORKER_URL: 'http://pyworker:8010', PYWORKER_API_TOKEN: token })({ id, attempt: 0 }), /Invalid Python worker endpoint/);
  await assert.rejects(createPythonExecutor({ PYWORKER_URL: 'http://other-service:8010', PYWORKER_API_TOKEN: token, PYWORKER_ALLOW_PRIVATE_NETWORK: 'true' })({ id, attempt: 0 }), /Invalid Python worker endpoint/);
  assert.equal(requests, 0);
  await createPythonExecutor({ PYWORKER_URL: 'http://pyworker:8010', PYWORKER_API_TOKEN: token, PYWORKER_ALLOW_PRIVATE_NETWORK: 'true' })({ id, attempt: 0 });
  assert.equal(requests, 1);
});
