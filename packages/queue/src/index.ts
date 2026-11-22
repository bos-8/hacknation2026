import { PgBoss } from "pg-boss";
import { Pool } from "pg";
import { QueryBackoff, QueueBackoffError } from './query-backoff.js';

export * from "./contracts.js";
import { DEFAULT_RETRY_LIMIT, DIAGNOSTIC_QUEUE, JOB_STATES, type JobRow, type QueueQuery, type QueuePage } from "./contracts.js";
import { DOCUMENT_QUEUE, QUEUE_ACTIONS, queueActionAllowed, type JobActionInput } from './contracts.js';
import type { QueueSummary, QueueStateCounts } from './contracts.js';
type Options = { migrate?: boolean; supervise?: boolean; schedule?: boolean; retryDelaySeconds?: number; pollingIntervalSeconds?: number; preserveQueuePolicy?: boolean };
const MONITORING_JOBS = ["monitoring.collect", "monitoring.cleanup"] as const;
const FORM_QUEUE = "form.process";
const formQueuePolicy = { policy: "exclusive" as const, retryLimit: 2, retryDelay: 10,
  retryBackoff: true, expireInSeconds: 420, heartbeatSeconds: 30 };
export type FormJob = {
  formId: string; actorUuid: string; sender: { name: string; email: string };
  reanalyze: boolean; asOf: string | null; previousHash: string;
};
type FormOutcome = { status: number; body: { mode?: string; error?: string; reason?: string; phase?: string; timeoutSeconds?: number } };

/** Queue-library-owned schema in a separate database. No application Prisma models. */
export class JobQueue {
  private readonly boss: PgBoss;
  private readonly pool: Pool;
  private started?: Promise<void>;
  private workerStarted = false;
  private runtimeConfigUuid: string | null | undefined;
  private readonly options: Options;
  private stopping = false;
  constructor(connectionString: string, options: Options = {}) {
    let valid = false;
    try { const url = new URL(connectionString); valid = ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname && url.pathname.slice(1)); } catch { /* Values stay private. */ }
    if (!valid) throw new Error("A queue PostgreSQL connection is required");
    this.options = options;
    this.pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
      statement_timeout: 10000, query_timeout: 11000, lock_timeout: 5000 });
    this.pool.on("error", () => console.error("Queue query connection unavailable"));
    this.boss = new PgBoss({ connectionString, max: 3, connectionTimeoutMillis: 5000,
      migrate: options.migrate ?? false, schedule: options.schedule ?? false, supervise: options.supervise ?? options.migrate ?? false,
      superviseIntervalSeconds: 10, maintenanceIntervalSeconds: 60,
    });
    const backoff = new QueryBackoff({
      onDelay: (count, delay) => {
        if (!this.stopping) console.error(`[queue] ${count} consecutive database query failures; next attempt in ${delay / 1000}s.`);
      },
      onRecovery: () => {
        if (!this.stopping) console.log('[queue] Database query recovered; normal polling restored.');
      },
    });
    // Instrument the public adapter without replacing pg-boss's pool, transactions or lifecycle.
    const adapter = this.boss.getDb();
    const execute = adapter.executeSql.bind(adapter);
    adapter.executeSql = (statement, values) => backoff.execute(statement, () => execute(statement, values));
    this.boss.on("error", error => {
      if (this.stopping || error instanceof QueueBackoffError) return;
      const value = 'code' in error && typeof error.code === 'string' ? error.code : '';
      const code = /^[A-Z0-9]{5}$/.test(value) ? ` (code ${value})` : '';
      console.error(`Queue processing operation failed${code}`);
    });
  }
  async start() {
    this.started ??= this.boss.start().then(async () => {
      if (this.options.migrate) {
        const policy = { retryLimit: DEFAULT_RETRY_LIMIT, retryDelay: this.options.retryDelaySeconds ?? 5, retryBackoff: true,
          retryDelayMax: 60, expireInSeconds: 60, heartbeatSeconds: 10, retentionSeconds: 7 * 86400, deleteAfterSeconds: 14 * 86400 };
        await this.boss.createQueue(DIAGNOSTIC_QUEUE, policy);
        await this.boss.createQueue(FORM_QUEUE, formQueuePolicy);
        if (!this.options.preserveQueuePolicy) await this.boss.updateQueue(DIAGNOSTIC_QUEUE, policy);
        await this.pool.query('CREATE INDEX IF NOT EXISTS modulon_job_created_on_idx ON pgboss.job (created_on DESC, id DESC)');
      }
    }).catch(error => { this.started = undefined; throw error; });
    await this.started;
  }
  async enqueueDiagnostic(failuresBeforeSuccess: number, actorUuid: string, executor: 'node' | 'python' = 'node') {
    if (!['node', 'python'].includes(executor)) throw new Error('Invalid diagnostic executor');
    if (!Number.isInteger(failuresBeforeSuccess) || failuresBeforeSuccess < 0 || failuresBeforeSuccess > 4 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorUuid)) throw new Error("Invalid queue diagnostic");
    await this.start();
    // PostgreSQL supplies the same UUIDv7 identity format as application records.
    const { rows } = await this.pool.query<{ id: string }>('SELECT uuidv7()::text AS id');
    const id = rows[0].id;
    const sent = await this.boss.send(DIAGNOSTIC_QUEUE, { failuresBeforeSuccess, actorUuid, executor }, { id });
    if (!sent) throw new Error("Queue diagnostic was not accepted");
    return sent;
  }
  async startWorker(pythonExecutor?: (job: { id: string; attempt: number }) => Promise<unknown>) {
    await this.start();
    if (this.workerStarted) return;
    this.workerStarted = true;
    try {
      await this.boss.work<{ failuresBeforeSuccess: number; executor?: 'node' | 'python' }>(DIAGNOSTIC_QUEUE,
        { includeMetadata: true, batchSize: 1, pollingIntervalSeconds: this.options.pollingIntervalSeconds ?? 1 }, async jobs => {
          for (const job of jobs) {
            const failures = job.data?.failuresBeforeSuccess;
            if (!Number.isInteger(failures) || failures < 0 || failures > 4) throw new Error("Invalid diagnostic payload");
            if (job.retryCount < failures) throw new Error("Controlled diagnostic attempt failed");
            if (job.data.executor === 'python') {
              if (!pythonExecutor) throw new Error('Python executor unavailable');
              await pythonExecutor({ id: job.id, attempt: job.retryCount });
            } else if (!job.data.executor || job.data.executor === 'node') await this.pool.query("SELECT 1");
            else throw new Error('Invalid diagnostic executor');
          }
          return { checked: true };
        });
    } catch (error) { this.workerStarted = false; throw error; }
  }
  async summary(): Promise<QueueSummary> {
    await this.start();
    const { rows } = await this.pool.query<{ state: typeof JOB_STATES[number]; total: string; python: string }>(
      `SELECT state, count(*)::text AS total, count(*) FILTER (WHERE data->>'executor'='python')::text AS python
       FROM pgboss.job GROUP BY state`);
    const empty = (): QueueStateCounts => ({ total: '0', created: '0', retry: '0', active: '0', completed: '0', cancelled: '0', failed: '0' });
    const result = { all: empty(), python: empty() };
    for (const row of rows) {
      if (!JOB_STATES.includes(row.state)) continue;
      result.all[row.state] = row.total;
      result.python[row.state] = row.python;
      result.all.total = (BigInt(result.all.total) + BigInt(row.total)).toString();
      result.python.total = (BigInt(result.python.total) + BigInt(row.python)).toString();
    }
    return result;
  }
  async startDocuments(processDocument: (ticket: string, lastAttempt: boolean) => Promise<void>) {
    await this.start();
    await this.boss.createQueue(DOCUMENT_QUEUE, { retryLimit: 3, retryDelay: 5,
      retryBackoff: true, expireInSeconds: 240, heartbeatSeconds: 20 });
    await this.boss.work(DOCUMENT_QUEUE, { batchSize: 1, includeMetadata: true }, async jobs => {
      for (const job of jobs) await processDocument(job.id, job.retryCount >= job.retryLimit);
    });
  }
  async startForms(processForm: (id: string, data: FormJob, signal: AbortSignal) => Promise<FormOutcome>) {
    await this.start();
    await this.boss.createQueue(FORM_QUEUE, formQueuePolicy);
    await this.boss.work<FormJob>(FORM_QUEUE, { batchSize: 1, pollingIntervalSeconds: 1, perJobResults: true }, async ([job]) => {
      const output = await processForm(job.id, job.data, job.signal);
      const transient = output.status === 429 || output.body.error === "worker_disconnected" || output.status === 503 && !output.body.error;
      return [{ id: job.id, output, status: output.status === 200 ? "completed" : transient ? "failed" : "deadletter" }];
    });
  }
  async formJob(formId: string, actor: string, operation: string | null) {
    await this.start();
    const { rows } = await this.pool.query<{ id: string; state: JobRow["state"]; output: FormOutcome | null }>(
      `SELECT id, state, output FROM pgboss.job WHERE name=$1 AND singleton_key=$2 AND data->>'actorUuid'=$3
       AND (id=$4::uuid OR ($4 IS NULL AND state <= 'active')) ORDER BY created_on DESC LIMIT 1`,
      [FORM_QUEUE, formId, actor, operation]);
    return rows[0];
  }
  async enqueueForm(operation: string, data: FormJob) {
    await this.start();
    const sent = await this.boss.send(FORM_QUEUE, { ...data, executor: "python" }, { id: operation, singletonKey: data.formId });
    if (sent) return sent;
    const existing = await this.formJob(data.formId, data.actorUuid, operation)
      ?? await this.formJob(data.formId, data.actorUuid, null);
    if (!existing) throw new Error("Form job was not accepted");
    return existing.id;
  }
  async dispatchDocument(ticket: string) {
    await this.boss.send(DOCUMENT_QUEUE, { executor: "python" }, { id: ticket });
  }
  async undeliverableDocuments(tickets: string[]) {
    if (!tickets.length) return [];
    const { rows } = await this.pool.query<{id: string}>(`
      SELECT t.id FROM unnest($1::uuid[]) AS t(id)
      LEFT JOIN pgboss.job j ON j.name = $2 AND j.id = t.id
      WHERE j.id IS NULL OR j.state IN ('failed','cancelled','completed')`, [tickets, DOCUMENT_QUEUE]);
    return rows.map(row => row.id);
  }
  async list(query: QueueQuery): Promise<QueuePage> {
    if (!Number.isInteger(query.page) || query.page < 1 || query.page > 40001 || ![1, 10, 25, 50].includes(query.limit)
      || typeof query.search !== "string" || query.search.length > 200 || query.state && !JOB_STATES.includes(query.state)) throw new Error("Invalid queue query");
    await this.start();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const pattern = query.search ? `%${query.search.replace(/[\\%_]/g, "\\$&")}%` : null;
      const values = [pattern, query.state ?? null];
      const where = '($1::text IS NULL OR name ILIKE $1 OR id::text ILIKE $1) AND ($2::text IS NULL OR state::text = $2)';
      const count = await client.query<{ total: string }>(`SELECT count(*)::text AS total FROM pgboss.job WHERE ${where}`, values);
      const { rows } = await client.query<JobRow>(`SELECT id, name, state, retry_count AS "retryCount", retry_limit AS "retryLimit",
        created_on AS "createdAt", started_on AS "startedAt", completed_on AS "completedAt", start_after AS "nextRunAt", data->>'actorUuid' AS "actorUuid", data->>'adminActionUuid' AS "adminActionUuid", CASE WHEN data->>'executor'='python' THEN 'python' ELSE 'node' END AS executor
        FROM pgboss.job WHERE ${where} ORDER BY created_on DESC, id DESC LIMIT $3 OFFSET $4`, [...values, query.limit, (query.page - 1) * query.limit]);
      await client.query("COMMIT");
      return { jobs: rows, total: Number(count.rows[0].total) };
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async startMonitoring(collect: (configUuid?: string) => Promise<unknown>, cleanup: (configUuid?: string) => Promise<unknown>, initializeSchedules = true) {
    await this.start();
    if (!this.options.schedule) throw new Error("Monitoring requires the durable scheduler");
    const policy = { policy: "exclusive" as const, retryLimit: DEFAULT_RETRY_LIMIT, retryDelay: 5, retryBackoff: true,
      expireInSeconds: 60, heartbeatSeconds: 10, retentionSeconds: 86400, deleteAfterSeconds: 86400 };
    for (const [index, name] of MONITORING_JOBS.entries()) {
      await this.boss.createQueue(name, policy);
      const { policy: immutablePolicy, ...settings } = policy;
      void immutablePolicy;
      if (initializeSchedules) await this.boss.updateQueue(name, settings);
      await this.boss.work<{ configUuid?: string }>(name, { batchSize: 1, pollingIntervalSeconds: 1 }, async jobs => {
        for (const job of jobs) { if (index === 0) await collect(job.data?.configUuid); else await cleanup(job.data?.configUuid); }
        return { checked: true };
      });
      if (initializeSchedules) {
        await this.boss.schedule(name, "* * * * *", {}, { tz: "UTC" });
        await this.boss.send(name, {});
      }
    }
  }
  async configureMonitoring(config: { uuid: string; monitoringIntervalSeconds: number; cleanupIntervalSeconds: number; queueRetryLimit: number } | null) {
    await this.start();
    if (!this.options.schedule) throw new Error("Scheduler owner required");
    if (!config) {
      for (const name of MONITORING_JOBS) await this.boss.unschedule(name);
      this.runtimeConfigUuid = null;
      return;
    }
    const cron = (seconds: number) => {
      if (!Number.isInteger(seconds) || seconds < 60 || seconds > 3600 || seconds % 60 || 3600 % seconds) throw new Error("Invalid schedule interval");
      return seconds === 3600 ? "0 * * * *" : `*/${seconds / 60} * * * *`;
    };
    const schedules = [cron(config.monitoringIntervalSeconds), cron(config.cleanupIntervalSeconds)];
    if (!Number.isInteger(config.queueRetryLimit) || config.queueRetryLimit < 0 || config.queueRetryLimit > 10) throw new Error("Invalid retry limit");
    await this.boss.updateQueue(DIAGNOSTIC_QUEUE, { retryLimit: config.queueRetryLimit });
    for (const [index, name] of MONITORING_JOBS.entries()) {
      await this.boss.updateQueue(name, { retryLimit: config.queueRetryLimit });
      await this.boss.schedule(name, schedules[index], { configUuid: config.uuid }, { tz: "UTC" });
      if (this.runtimeConfigUuid !== config.uuid) await this.boss.send(name, { configUuid: config.uuid });
    }
    this.runtimeConfigUuid = config.uuid;
  }
  async workerHealthy() {
    await this.start();
    const instances = await this.boss.getInstances();
    return instances.some(instance => instance.live && instance.workers.some(worker => worker.queue === DIAGNOSTIC_QUEUE));
  }
  async stop() {
    this.stopping = true;
    await this.boss.stop({ graceful: true, timeout: 30000 });
    await this.pool.end();
  }
  async changeJob(input: JobActionInput, actorUuid: string, activeConfigUuid: string | null = null) {
    const uuid = (v: unknown) => typeof v === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
    if (!input || !uuid(input.id) || !uuid(actorUuid) || !QUEUE_ACTIONS.includes(input.operation) || !JOB_STATES.includes(input.expectedState)
      || !Number.isInteger(input.expectedRetryCount) || input.expectedRetryCount < 0 || input.expectedAdminActionUuid !== null && !uuid(input.expectedAdminActionUuid)
      || ![DIAGNOSTIC_QUEUE, ...MONITORING_JOBS].includes(input.name)) return { status: 'invalid' as const };
    await this.start();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = (await client.query<{ name: string; state: JobRow['state']; retryCount: number; data: Record<string, unknown> }>(
        'SELECT name, state, retry_count AS "retryCount", data FROM pgboss.job WHERE id=$1::uuid AND name=$2 FOR UPDATE', [input.id, input.name])).rows[0];
      if (!row || row.state !== input.expectedState || row.retryCount !== input.expectedRetryCount || (row.data?.adminActionUuid ?? null) !== input.expectedAdminActionUuid || !queueActionAllowed(input.operation, row.state)) {
        await client.query('ROLLBACK'); return { status: 'conflict' as const };
      }
      if (['repeat','retry','resume'].includes(input.operation) && row.name !== DIAGNOSTIC_QUEUE && (!activeConfigUuid || row.data?.configUuid !== activeConfigUuid)) {
        await client.query('ROLLBACK'); return { status: 'inactiveConfig' as const };
      }
      const options = { db: { executeSql: (sql: string, values?: unknown[]) => client.query(sql, values) } };
      const actionUuid = (await client.query<{id:string}>('SELECT uuidv7()::text AS id')).rows[0].id;
      let newId: string | null = null;
      if (input.operation === 'repeat') {
        let data: Record<string, unknown>;
        if (row.name === DIAGNOSTIC_QUEUE) {
          const failures = row.data?.failuresBeforeSuccess;
          if (!Number.isInteger(failures) || Number(failures) < 0 || Number(failures) > 4) throw new Error('Invalid diagnostic payload');
          const executor = row.data?.executor ?? 'node';
          if (!['node','python'].includes(String(executor))) throw new Error('Invalid diagnostic executor');
          data = { failuresBeforeSuccess: failures, actorUuid, repeatedFromUuid: input.id, executor };
        } else data = { configUuid: activeConfigUuid, actorUuid, repeatedFromUuid: input.id };
        newId = await this.boss.send(row.name, data, { ...options, id: actionUuid });
        if (!newId) { await client.query('ROLLBACK'); return { status: 'conflict' as const }; }
      } else {
        const changed = input.operation === 'retry' ? await this.boss.retry(row.name, input.id, options)
          : input.operation === 'resume' ? await this.boss.resume(row.name, input.id, options)
          : input.operation === 'cancel' ? await this.boss.cancel(row.name, input.id, options) : await this.boss.deleteJob(row.name, input.id, options);
        if (changed.affected !== 1) { await client.query('ROLLBACK'); return { status: 'conflict' as const }; }
      }
      if (input.operation !== 'delete') await client.query(`UPDATE pgboss.job SET data=COALESCE(data,'{}'::jsonb)||jsonb_build_object('adminActionUuid',$3::text,'lastAdminActorUuid',$4::text,'lastAdminAction',$5::text) WHERE id=$1::uuid AND name=$2`, [input.id, row.name, actionUuid, actorUuid, input.operation]);
      await client.query('COMMIT');
      return { status: 'ok' as const, ...(newId ? { id: newId } : {}) };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
}
