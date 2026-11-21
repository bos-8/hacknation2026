import { composeArgs } from '../../scripts/lib/compose.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { JobQueue } from '../../packages/queue/dist/index.js';

const infra = parseEnv(readFileSync('infra/local/.env.dev', 'utf8'));
const source = new URL(parseEnv(readFileSync('packages/database/.env', 'utf8')).DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(source.hostname)); assert.equal(source.port, infra.DB_PORT);
const name = `modulon_queue_test_${randomBytes(8).toString('hex')}`;
assert.match(name, /^modulon_queue_test_[a-f0-9]{16}$/);
const url = new URL(source); url.pathname = '/' + name; url.search = '';
let queue, created = false;
function admin(operation) {
  const args = operation === 'create'
    ? ['sh', '-c', 'exec createdb -U "$POSTGRES_USER" -O "$1" "$2"', 'queue-test', decodeURIComponent(source.username), name]
    : ['sh', '-c', 'exec dropdb -U "$POSTGRES_USER" --if-exists --force "$1"', 'queue-test', name];
  const result = spawnSync('docker', [...composeArgs(process.cwd(), 'dev', infra), 'exec', '-T', 'db', ...args], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, 'Disposable queue database operation failed; output hidden');
}
const query = { page: 1, limit: 25, search: '' };
try {
  admin('create'); created = true;
  queue = new JobQueue(url.href, { migrate: true, retryDelaySeconds: 0, pollingIntervalSeconds: 0.5 });
  await queue.start();
  const actor = randomUUID();
  const success = await queue.enqueueDiagnostic(0, actor);
  const recovery = await queue.enqueueDiagnostic(1, actor);
  const failure = await queue.enqueueDiagnostic(4, actor);
  let page = await queue.list(query);
  assert.deepEqual(page.jobs.map(job => job.id), [failure, recovery, success]);
  assert.equal(page.total, 3); assert.ok(page.jobs.every(job => job.retryLimit === 3 && job.state === 'created'));
  assert.equal((await queue.list({ ...query, page: 2, limit: 1 })).jobs[0].id, recovery);
  await queue.stop();
  queue = new JobQueue(url.href, { supervise: true, pollingIntervalSeconds: 0.5 });
  assert.equal((await queue.list(query)).total, 3);
  await queue.startWorker();
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    page = await queue.list(query);
    if (page.jobs.every(job => ['completed', 'failed'].includes(job.state))) break;
    await delay(500);
  }
  const byId = new Map(page.jobs.map(job => [job.id, job]));
  assert.equal(byId.get(success).state, 'completed'); assert.equal(byId.get(success).retryCount, 0);
  assert.equal(byId.get(recovery).state, 'completed'); assert.equal(byId.get(recovery).retryCount, 1);
  assert.equal(byId.get(failure).state, 'failed'); assert.equal(byId.get(failure).retryCount, 3);
  assert.equal((await queue.list({ ...query, state: 'failed' })).total, 1);
  assert.equal((await queue.list({ ...query, search: failure })).total, 1);
  console.log('PASS durable queue restart, newest-first paging, successful recovery and failure after exactly 1+3 attempts');
  await queue.stop();
  queue = new JobQueue(url.href, { supervise: true, schedule: true, pollingIntervalSeconds: 0.5 });
  await queue.startWorker();
  let collected = 0, cleaned = 0;
  await queue.startMonitoring(async () => { collected++; return { sampled: 7 }; }, async () => { cleaned++; return { count: 0 }; });
  const startupDeadline = Date.now() + 15000;
  while ((!collected || !cleaned) && Date.now() < startupDeadline) await delay(250);
  assert.ok(collected && cleaned, 'Startup monitoring jobs must run');
  await queue.stop();
  queue = new JobQueue(url.href, { supervise: true, schedule: true, pollingIntervalSeconds: 0.5 });
  await queue.startWorker();
  collected = 0; cleaned = 0;
  await queue.startMonitoring(async () => { collected++; return { sampled: 7 }; }, async () => { cleaned++; return { count: 0 }; });
  const recurringDeadline = Date.now() + 100000;
  while ((collected < 2 || cleaned < 2) && Date.now() < recurringDeadline) await delay(500);
  assert.ok(collected >= 2 && cleaned >= 2, 'Persisted cron jobs must recur after worker restart');
  const monitoring = await queue.list({ ...query, search: 'monitoring.' });
  assert.ok(monitoring.jobs.length >= 4 && monitoring.jobs.every(job => job.retryLimit === 3));
  console.log('PASS persisted minute schedules, startup delivery, recurrence after restart and default 3 retries');
  const require = createRequire(new URL('../../packages/queue/package.json', import.meta.url));
  const { Pool } = require('pg');
  const inspector = new Pool({ connectionString: url.href, max: 1 });
  try {
    await queue.configureMonitoring(null);
    assert.equal(Number((await inspector.query("SELECT count(*) AS total FROM pgboss.schedule WHERE name LIKE 'monitoring.%'")).rows[0].total), 0);
    const configUuid = randomUUID();
    await queue.configureMonitoring({ uuid: configUuid, monitoringIntervalSeconds: 300, cleanupIntervalSeconds: 600, queueRetryLimit: 2 });
    const schedules = (await inspector.query("SELECT name, cron, data FROM pgboss.schedule WHERE name LIKE 'monitoring.%' ORDER BY name")).rows;
    assert.equal(schedules.length, 2);
    assert.equal(schedules.find(row => row.name === 'monitoring.collect').cron, '*/5 * * * *');
    assert.equal(schedules.find(row => row.name === 'monitoring.cleanup').cron, '*/10 * * * *');
    assert.ok(schedules.every(row => row.data.configUuid === configUuid));
    const diagnostic = await queue.enqueueDiagnostic(0, actor);
    assert.equal((await queue.list({ ...query, search: diagnostic })).jobs[0].retryLimit, 2);
    await assert.rejects(queue.configureMonitoring({ uuid: configUuid, monitoringIntervalSeconds: 61, cleanupIntervalSeconds: 60, queueRetryLimit: 2 }));
    console.log('PASS configuration pauses/resumes schedules, changes cron intervals, pins job versions and changes producer retry limits');
  } finally { await inspector.end(); }
} finally {
  await queue?.stop().catch(() => {});
  if (created) admin('drop');
}
