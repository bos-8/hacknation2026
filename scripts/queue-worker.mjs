import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { JobQueue } from '../packages/queue/dist/index.js';
import { createDatabaseClient, runActiveSystemConfig, reconcileSystemConfig } from '../packages/database/dist/index.js';
import { hostname } from 'node:os';
import { collectHealth, cleanupHealth } from '../packages/monitoring/dist/index.js';
import { ROOT } from './lib/runtime.mjs';
import { createPythonExecutor } from './lib/pyworker-client.mjs';
import { startQueueBridge } from './lib/queue-bridge.mjs';
import { processStoredForm } from "../apps/web/scripts/form-jobs.mjs";
import { documentJobs } from '../apps/web/scripts/document-jobs.mjs';
import { writeFile, rm } from 'node:fs/promises';
import { workerControl } from './lib/worker-control.mjs';

try { loadEnvFile(path.join(ROOT, 'apps/web/.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const queue = new JobQueue(process.env.QUEUE_DATABASE_URL || '', { supervise: true, schedule: true });
const database = createDatabaseClient({ connectionString: process.env.DATABASE_URL || '', maxConnections: 2 });
const documents = documentJobs(database, queue, process.env);
let stopping = false;
let reconcileTimer, reconciling;
let queueBridge;
let closeControl;
let stopPromise;
const workerKey = `${hostname()}:${process.pid}`.slice(0, 120);
const healthFile = process.env.QUEUE_HEALTH_FILE;
if (healthFile && healthFile !== '/tmp/queue-ready.json') throw new Error('Invalid container health file');
async function reconcile() {
  if (reconciling || stopping) return;
  reconciling = (async () => {
    try { await reconcileSystemConfig(database, workerKey, config => queue.configureMonitoring(config)); }
    catch {
      console.error('[queue] Configuration reconciliation failed; retrying.');
      await database.systemConfigWorker.updateMany({ where: { workerKey }, data: { heartbeatAt: new Date(), errorCode: 'reconcile_failed' } }).catch(() => {});
    }
    // Expiry is an installation invariant, also before the first version is activated.
    try { await cleanupHealth(database); }
    catch { console.error('[queue] Expired history cleanup unavailable.'); }
    try { await documents.dispatch(); }
    catch { console.error('[queue] Document dispatch unavailable; retrying.'); }
  })();
  try { await reconciling; } finally { reconciling = undefined; }
}
function stop() {
  return stopPromise ??= (async () => {
  stopping = true;
  clearInterval(reconcileTimer);
  if (healthFile) await rm(healthFile, { force: true });
  try { await queueBridge?.close(); } catch { process.exitCode = 1; }
  await reconciling?.catch(() => {});
  try { await queue.stop(); } catch { process.exitCode = 1; }
  documents.close();
  await database.$disconnect();
  closeControl?.();
  if (process.connected) process.disconnect();
  })();
}
process.once('SIGINT', stop); process.once('SIGTERM', stop);
process.on('message', message => { if (message?.type === 'shutdown') void stop(); });
process.once('disconnect', () => void stop());
try {
  await queue.startWorker(createPythonExecutor(process.env));
  await queue.startDocuments(documents.process);
  await queue.startForms((id, job, signal) => processStoredForm(database, documents.readSource, id, job, signal));
  if (process.env.FORMIQ_DEV_PREPARED === 'true') closeControl = await workerControl(ROOT, 'queue', stop);
  queueBridge = await startQueueBridge({
    queue,
    reportOcrProgress: async (ticket, percent) => {
      const sampledAt = new Date();
      const updated = await database.documentAnalysis.updateMany({
        where: { ticket, stage: 'ocr', startedAt: { not: null }, OR: [{ ocrProgress: null }, { ocrProgress: { lt: percent } }] },
        data: { ocrProgress: percent, sampledAt },
      });
      if (!updated.count) await database.documentExport.updateMany({
        where: { ticket, stage: 'queued', startedAt: { not: null }, OR: [{ progress: null }, { progress: { lt: percent } }] },
        data: { progress: percent, sampledAt },
      });
    },
    systemActor: async () => {
      const actor = await database.user.findUnique({ where: { systemKey: 'SYSTEM' }, select: { uuid: true, keycloakUuid: true } });
      if (!actor || actor.keycloakUuid !== null) throw new Error('SYSTEM actor unavailable');
      return actor.uuid;
    },
  });
  const run = (configUuid, cleanup) => runActiveSystemConfig(database, configUuid, config =>
    cleanup ? cleanupHealth(database, new Date(), config.historyRetentionDays)
      : collectHealth(database, { ...process.env, MONITORING_SLOW_MS: String(config.slowResponseMs) }, () => queue.workerHealthy(), new Date(), config.historyRetentionDays)
  );
  await queue.startMonitoring(id => run(id, false), id => run(id, true), false);
  await reconcile();
  reconcileTimer = setInterval(() => void reconcile(), 10000);
  if (healthFile) {
    await writeFile(healthFile, JSON.stringify({ pid: process.pid }), { mode: 0o600 });
  }
  console.log('[queue] Worker ready; applying the active configuration every 10 seconds.');
}
catch (error) {
  if (error?.code === '42P01' || error?.code === '3F000') console.error('[queue] Queue schema is missing. Run pnpm queue:setup before restarting the worker.');
  else console.error('[queue] Worker unavailable. Check database, queue schema (pnpm queue:setup) and optional queue bridge configuration.');
  process.exitCode = 1;
  await stop();
}
