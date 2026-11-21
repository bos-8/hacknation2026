import { ROOT, main, readEnvironment, logStatus } from './lib/runtime.mjs';

export function validateDevDatabaseTargets(infra, database, web, inherited = {}) {
  if (infra.ENV_MODE !== 'dev') throw new Error('DEV database verification requires ENV_MODE=dev');
  const expected = [
    [inherited.DATABASE_URL || database.DATABASE_URL, infra.DB_APP_DATABASE_NAME, infra.DB_APP_USERNAME],
    [inherited.DATABASE_URL || web.DATABASE_URL, infra.DB_APP_DATABASE_NAME, infra.DB_APP_USERNAME],
    [inherited.QUEUE_DATABASE_URL || web.QUEUE_DATABASE_URL, infra.DB_QUEUE_DATABASE_NAME || 'formiq_queue', infra.DB_QUEUE_USERNAME || 'formiq_queue'],
  ];
  const port = String(infra.DB_PORT || '5432');
  try {
    for (const [connection, name, user] of expected) {
      const url = new URL(connection);
      const keys = [...url.searchParams.keys()];
      const allowed = new Set(['schema', 'connection_limit', 'sslmode', 'connect_timeout', 'pool_timeout']);
      if (!name || !user || !['postgres:', 'postgresql:'].includes(url.protocol)
        || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || (url.port || '5432') !== port || decodeURIComponent(url.pathname.slice(1)) !== name
        || decodeURIComponent(url.username) !== user || !url.password
        || url.hash || keys.some(key => !allowed.has(key)) || new Set(keys).size !== keys.length
        || (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) throw new Error();
    }
    if (expected[0][1] === expected[2][1]) throw new Error();
  } catch {
    throw new Error('DEV database targets must match the configured local application and separate queue database; connection details hidden');
  }
}

export async function checkDevDatabases({ root = ROOT, inherited = process.env, log = logStatus } = {}) {
  const [infra, database, web] = await Promise.all([
    readEnvironment(root, 'infra/local/.env.dev'),
    readEnvironment(root, 'packages/database/.env'),
    readEnvironment(root, 'apps/web/.env'),
  ]);
  validateDevDatabaseTargets(infra, database, web, inherited);
  log('[ok] DEV application and queue database targets match the local stack.');
}

main(import.meta.url, () => checkDevDatabases());
