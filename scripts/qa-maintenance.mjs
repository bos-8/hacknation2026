import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../packages/database/dist/index.js';
import { seedDatabase, SYSTEM_KEY, SYSTEM_USER_KEY, SYSTEM_ROLES } from '../packages/database/dist/seed.js';
import { JobQueue } from '../packages/queue/dist/index.js';

const databaseRoot = fileURLToPath(new URL('../packages/database/', import.meta.url));
const prismaCli = createRequire(new URL('../packages/database/package.json', import.meta.url)).resolve('prisma/build/index.js');

const action = process.argv[2];
if (!['deploy', 'verify'].includes(action)) throw new Error('Use deploy or verify');
let database, queue;
try {
  // The container has only the QA app/queue runtime roles, never DB administrator credentials.
  const code = await new Promise((resolve, reject) => {
    // Execute the pinned installed CLI; package-manager auto-install is forbidden at runtime.
    const child = spawn(process.execPath, [prismaCli, 'migrate', action === 'deploy' ? 'deploy' : 'status', '--config', 'prisma.config.ts'], { cwd: databaseRoot, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => resolve(code));
  });
  if (code !== 0) throw new Error('Migration step failed');
  database = createDatabaseClient({ connectionString: process.env.DATABASE_URL || '', maxConnections: 2 });
  if (action === 'deploy') {
    const result = await seedDatabase(database);
    console.log(`[qa] Seed ${result.status}; existing data preserved.`);
    queue = new JobQueue(process.env.QUEUE_DATABASE_URL || '', { migrate: true });
    await queue.start();
  } else {
    const system = await database.system.findUnique({ where: { key: SYSTEM_KEY } });
    const actor = await database.user.findUnique({ where: { systemKey: SYSTEM_USER_KEY } });
    const roles = await database.role.count({ where: { code: { in: [...SYSTEM_ROLES] } } });
    if (!system || !actor || actor.keycloakUuid !== null || roles !== SYSTEM_ROLES.length) throw new Error('Seed missing');
    queue = new JobQueue(process.env.QUEUE_DATABASE_URL || '');
    await queue.start();
  }
  console.log(`[qa] Database ${action} complete.`);
} catch {
  console.error('[qa] Database preparation/verification failed. Run qa:deploy and inspect local configuration.');
  process.exitCode = 1;
} finally {
  await queue?.stop().catch(() => { process.exitCode = 1; });
  await database?.$disconnect();
}
