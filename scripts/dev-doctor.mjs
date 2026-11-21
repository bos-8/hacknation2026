import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { ROOT, main, readEnvironment, logStatus } from './lib/runtime.mjs';
import { validateEnvironment } from './validate-env.mjs';
import { validateCertificates } from './validate-certs.mjs';
import { checkAuthSecret } from './check-dev-auth.mjs';
import { checkDockerEngine, checkDockerContainers } from './check-docker.mjs';
import { checkDevDatabases } from './check-dev-databases.mjs';
import { devPorts, portAvailable } from './check-ports.mjs';

/** Continue after independent failures, print only static diagnostics and never execute repair commands. */
export async function runDoctor(checks, { log = logStatus } = {}) {
  const results = [];
  for (const check of checks) {
    try { await check.run(); log(`[ok] ${check.name}`); results.push({ name: check.name, ok: true }); }
    catch { log(`[error] ${check.name}. Next: ${check.fix}`); results.push({ name: check.name, ok: false }); }
  }
  return results;
}

export async function databaseCheck(root = ROOT, kind = 'app') {
  if (!['app', 'queue'].includes(kind)) throw new Error('Unknown database check');
  await checkDevDatabases({ root, log: () => {} });
  const web = await readEnvironment(root, 'apps/web/.env');
  const require = createRequire(path.join(root, 'packages/queue/package.json'));
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env[kind === 'app' ? 'DATABASE_URL' : 'QUEUE_DATABASE_URL'] || web[kind === 'app' ? 'DATABASE_URL' : 'QUEUE_DATABASE_URL'],
    connectionTimeoutMillis: 5000, query_timeout: 5000, statement_timeout: 5000 });
  try {
    await client.connect();
    const tables = kind === 'app' ? ['public._prisma_migrations', 'public.product', 'public.file', 'public.session'] : ['pgboss.version', 'pgboss.job', 'pgboss.queue'];
    const { rows } = await client.query('SELECT name, to_regclass(name) IS NOT NULL AS present FROM unnest($1::text[]) AS name', [tables]);
    if (rows.some(row => !row.present)) throw new Error('Schema missing');
    if (kind === 'app') {
      const expected = (await readdir(path.join(root, 'packages/database/prisma/migrations'), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
      const applied = (await client.query('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows.map(row => row.migration_name);
      if (expected.some(name => !applied.includes(name))) throw new Error('Pending migrations');
    } else if (!(await client.query("SELECT name FROM pgboss.queue WHERE name='system.check'")).rowCount) throw new Error('Diagnostic queue missing');
  } finally { await client.end(); }
}

export async function doctor({ root = ROOT, log = logStatus } = {}) {
  const quiet = () => {};
  const checks = [
    { name: 'DEV env files and required variables', fix: 'pnpm validate:dev', run: () => validateEnvironment(root, { mode: 'dev', log: quiet }) },
    { name: 'Web auth configuration and matching infrastructure credentials', fix: 'pnpm check:dev-auth; reconcile apps/web/.env with infra/local/.env.dev', run: async () => {
      const infra = await readEnvironment(root, 'infra/local/.env.dev');
      const web = { ...await readEnvironment(root, 'apps/web/.env'), ...process.env };
      checkAuthSecret(web);
      const { getAuthConfig } = await import('../apps/web/src/server/auth/config.ts');
      getAuthConfig(web);
      for (const [app, source] of [['AUTH_CLIENT_SECRET', 'KEYCLOAK_WEB_CLIENT_SECRET'], ['AUTH_DIRECTORY_CLIENT_SECRET', 'AUTH_DIRECTORY_CLIENT_SECRET'],
        ['S3_APP_ACCESS_KEY', 'S3_APP_ACCESS_KEY'], ['S3_APP_SECRET_KEY', 'S3_APP_SECRET_KEY'], ['S3_AVATAR_SECRET_KEY', 'S3_AVATAR_SECRET_KEY']]) {
        if (web[app] !== infra[source]) throw new Error('Credential mismatch');
      }
    } },
    { name: 'Local TLS certificate, key, CA and configured hostnames', fix: 'pnpm validate:certs', run: async () => {
      const env = await readEnvironment(root, 'infra/local/.env.dev');
      const certs = path.resolve(root, 'infra/local', env.CERTS_DIR || './certs');
      await validateCertificates({ cert: path.join(certs, env.TLS_CERT_PEM || 'localhost.pem'), key: path.join(certs, env.TLS_CERT_KEY || 'localhost-key.pem'),
        ca: path.join(certs, env.TLS_CA_PEM || 'rootCA.pem'), hosts: ['localhost', ...['APP_HOST', 'WEB_HOST', 'AUTH_HOST', 'AUTH_ADMIN_HOST', 'S3_HOST', 'S3CONSOLE_HOST'].map(key => env[key]).filter(Boolean)] });
    } },
    { name: 'Docker Engine', fix: 'start Docker Desktop, then pnpm check:docker', run: () => checkDockerEngine({ log: quiet }) },
    { name: 'Owned DEV infrastructure containers are healthy', fix: 'pnpm dev:infra:status; pnpm dev:infra:up', run: () => checkDockerContainers({ root, log: quiet }) },
    { name: 'Application database connection and committed Prisma migrations', fix: 'pnpm dev:prepare', run: () => databaseCheck(root, 'app') },
    { name: 'Queue database connection, pg-boss schema and diagnostic queue', fix: 'pnpm dev:queue:prepare', run: () => databaseCheck(root, 'queue') },
    { name: 'Configured host ports inspected (busy ports may belong to running DEV)', fix: 'pnpm check:dev-ports', run: async () => {
      const web = await readEnvironment(root, 'apps/web/.env'), python = await readEnvironment(root, 'apps/pyworker/.env');
      for (const port of devPorts(web, python, process.env)) log(`[info] Port ${port}: ${await portAvailable(port) ? 'free' : 'occupied; verify the owner before restarting'}`);
    } },
  ];
  const results = await runDoctor(checks, { log });
  log(`[info] Doctor: ${results.filter(result => result.ok).length}/${results.length} checks passed. Read-only; no repairs, installs or restarts executed.`);
  return results;
}

main(import.meta.url, async () => { if ((await doctor()).some(result => !result.ok)) process.exitCode = 1; });
