import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../packages/queue/package.json', import.meta.url));

try {
  const { pid } = JSON.parse(await readFile(process.env.QUEUE_HEALTH_FILE || '/tmp/queue-ready.json', 'utf8'));
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error();
  process.kill(pid, 0);
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.QUEUE_DATABASE_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 3000 });
  try { await pool.query('SELECT 1'); } finally { await pool.end(); }
} catch { process.exitCode = 1; }
