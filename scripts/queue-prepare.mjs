import { JobQueue } from '../packages/queue/dist/index.js';
import { checkDevDatabases } from './check-dev-databases.mjs';
import { ROOT, main, readEnvironment, logStatus } from './lib/runtime.mjs';

/** Prepare pg-boss in the existing DEV database; never provision roles or edit credentials. */
export async function prepareDevQueue({ root = ROOT, inherited = process.env, log = logStatus,
  createQueue = connection => new JobQueue(connection, { migrate: true, supervise: false, schedule: false, preserveQueuePolicy: true }),
} = {}) {
  await checkDevDatabases({ root, inherited, log });
  const web = await readEnvironment(root, 'apps/web/.env');
  const queue = createQueue(inherited.QUEUE_DATABASE_URL || web.QUEUE_DATABASE_URL);
  try {
    await queue.start();
    log('[ok] DEV queue schema and diagnostic queue ready. Existing jobs, queue policy and credentials preserved.');
  } catch {
    throw new Error('DEV queue schema preparation failed. Check the existing queue database credentials and permissions; values hidden.');
  } finally {
    await queue.stop();
  }
}

main(import.meta.url, () => prepareDevQueue());
