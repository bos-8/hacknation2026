import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { JobQueue } from '../packages/queue/dist/index.js';
import { ROOT, main } from './lib/runtime.mjs';
import path from 'node:path';
import { composeArgs } from './lib/compose.mjs';

/** Explicit DEV provisioning, separate from application Prisma migrations. */
main(import.meta.url, async () => {
  const infraFile = path.join(ROOT, 'infra/local/.env.dev');
  const webFile = path.join(ROOT, 'apps/web/.env');
  let content = await readFile(infraFile, 'utf8');
  const env = parseEnv(content);
  if (env.ENV_MODE !== 'dev' || !/^[a-zA-Z0-9_-]+$/.test(env.STACK_NAME)) throw new Error('Queue setup requires the configured local DEV stack');
  const webContent = await readFile(webFile, 'utf8');
  const web = parseEnv(webContent);
  const app = new URL(web.DATABASE_URL);
  if (!['127.0.0.1', 'localhost'].includes(app.hostname) || (app.port || '5432') !== (env.DB_PORT || '5432') || app.pathname.slice(1) !== env.DB_APP_DATABASE_NAME) throw new Error('Queue setup target differs from the configured local application stack');
  const values = { DB_QUEUE_DATABASE_NAME: env.DB_QUEUE_DATABASE_NAME || 'modulon_queue', DB_QUEUE_USERNAME: env.DB_QUEUE_USERNAME || 'modulon_queue',
    DB_QUEUE_PASSWORD: env.DB_QUEUE_PASSWORD || randomBytes(32).toString('hex'), DB_QUEUE_CONNECTION_LIMIT: env.DB_QUEUE_CONNECTION_LIMIT || '12' };
  for (const key of ['DB_QUEUE_DATABASE_NAME', 'DB_QUEUE_USERNAME']) if (!/^[a-z_][a-z0-9_]{0,62}$/.test(values[key])) throw new Error('Invalid queue database identity');
  if (values.DB_QUEUE_PASSWORD.length < 32 || ['SECRET_CHANGE_ME', 'CHANGE_ME'].includes(values.DB_QUEUE_PASSWORD)) throw new Error('Queue credentials are not configured');
  for (const [key, value] of Object.entries(values)) if (!(key in env)) content += `\n${key}=${value}${key.endsWith('PASSWORD') ? ' # <<< [!]' : ''}`;
  if (content !== await readFile(infraFile, 'utf8')) await writeFile(infraFile, content + '\n');
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  const bootstrap = (await readFile(path.join(ROOT, 'infra/local/postgres/init/init-queue.sh'), 'utf8')).replace(/\r\n/g, '\n');
  const script = Object.entries(values).map(([key, value]) => `export ${key}=${quote(value)}`).join('\n') + '\n' + bootstrap;
  let diagnostic = '';
  const code = await new Promise((resolve, reject) => {
    const child = spawn('docker', [...composeArgs(ROOT, 'dev', env), 'exec', '-T', 'db', 'sh'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const collect = chunk => { if (diagnostic.length < 8000) diagnostic += chunk.toString(); };
    child.on('error', reject); child.stdout.on('data', collect); child.stderr.on('data', collect); child.on('exit', resolve); child.stdin.end(script);
  });
  if (code !== 0) {
    for (const [key, value] of Object.entries({ ...env, ...values })) if (/PASSWORD|SECRET|TOKEN/.test(key) && value) diagnostic = diagnostic.replaceAll(value, '[REDACTED]');
    const safe = diagnostic.split(/\r?\n/).find(line => /ERROR|FATAL|error|Refusing|not found|unbound|bad/.test(line))?.slice(0, 300);
    throw new Error(`Queue database provisioning failed${safe ? ': ' + safe : '; SQL output hidden'}`);
  }
  const url = new URL('postgresql://127.0.0.1');
  url.username = values.DB_QUEUE_USERNAME; url.password = values.DB_QUEUE_PASSWORD; url.port = env.DB_PORT || '5432'; url.pathname = '/' + values.DB_QUEUE_DATABASE_NAME;
  const placeholder = parseEnv(await readFile(path.join(ROOT, 'apps/web/.env.example'), 'utf8')).QUEUE_DATABASE_URL;
  if (web.QUEUE_DATABASE_URL && web.QUEUE_DATABASE_URL !== placeholder && web.QUEUE_DATABASE_URL !== url.href) throw new Error('Existing Web queue connection differs; refusing to overwrite credentials');
  if (!web.QUEUE_DATABASE_URL || web.QUEUE_DATABASE_URL === placeholder) {
    const updated = Object.hasOwn(web, 'QUEUE_DATABASE_URL')
      ? webContent.replace(/^[ \t]*(?:export[ \t]+)?QUEUE_DATABASE_URL=.*$/m, () => 'QUEUE_DATABASE_URL=' + url.href)
      : webContent + '\n# Server-only queue connection\nQUEUE_DATABASE_URL=' + url.href + '\n';
    await writeFile(webFile, updated);
  }
  const queue = new JobQueue(url.href, { migrate: true });
  try { await queue.start(); console.log('Queue DEV database/schema ready. Default: 3 retries after the first attempt.'); }
  catch { throw new Error('Queue schema setup failed; database details hidden'); }
  finally { await queue.stop(); }
});
