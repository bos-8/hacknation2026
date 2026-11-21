import { composeArgs } from '../../scripts/lib/compose.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { registerHooks, createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createDatabaseClient } from '../../packages/database/dist/index.js';

const infra = parseEnv(readFileSync('infra/local/.env.dev', 'utf8'));
const source = new URL(parseEnv(readFileSync('packages/database/.env', 'utf8')).DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(source.hostname));
assert.equal(source.port, infra.DB_PORT);
const name = `modulon_llm_${randomBytes(8).toString('hex')}`;
assert.match(name, /^modulon_llm_[a-f0-9]{16}$/);
const url = new URL(source); url.pathname = `/${name}`;
const require = createRequire(new URL('../../packages/database/package.json', import.meta.url));
const prisma = require.resolve('prisma/build/index.js');
const packagePath = fileURLToPath(new URL('../../packages/database/', import.meta.url));
let created = false;
let database;
function admin(operation) {
  const args = operation === 'create'
    ? ['sh', '-c', 'exec createdb -U "$POSTGRES_USER" -O "$1" "$2"', 'llm-test', decodeURIComponent(source.username), name]
    : ['sh', '-c', 'exec dropdb -U "$POSTGRES_USER" --if-exists --force "$1"', 'llm-test', name];
  const result = spawnSync('docker', [...composeArgs(process.cwd(), 'dev', infra), 'exec', '-T', 'db', ...args], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, 'Disposable database administration failed; output hidden');
}
try {
  admin('create'); created = true;
  const migration = spawnSync(process.execPath, [prisma, 'migrate', 'deploy', '--config', 'prisma.config.ts'], {
    cwd: packagePath, env: { ...process.env, DATABASE_URL: url.href, SHADOW_DATABASE_URL: '' }, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(migration.status, 0, 'Prisma deployment into disposable database failed; output hidden');
  database = createDatabaseClient({ connectionString: url.href });
  const author = await database.user.create({ data: { keycloakUuid: randomUUID() } });
  const original = await database.llmSettings.findUniqueOrThrow({
    where: { key: 'chat' }, include: { activePrompt: true },
  });
  assert.equal(original.activePrompt.version, 1);
  assert.ok(original.activePrompt.systemPrompt.length > 0);
  globalThis.__llmIntegrationDb = database;
  const server = new URL('../../apps/web/src/server/llm-settings.ts', import.meta.url);
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL !== server.href) return next(specifier, context);
    if (specifier === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true };
    if (specifier === './database.ts') return {
      url: 'data:text/javascript,export const getDatabase=()=>globalThis.__llmIntegrationDb;',
      shortCircuit: true,
    };
    return next(specifier, context);
  } });
  try {
    const { createLlmPrompt, activateLlmPrompt, readLlmSettings } = await import(server.href);
    const created = await Promise.all([
      createLlmPrompt(author.uuid, 'Draft one'),
      createLlmPrompt(author.uuid, 'Draft two'),
    ]);
    assert.deepEqual(created.map(prompt => prompt.version).sort(), [2, 3]);
    assert.equal((await readLlmSettings()).active.uuid, original.activePrompt.uuid);
    const competing = await Promise.all(created.map(prompt => activateLlmPrompt(author.uuid, prompt.uuid, original.activePrompt.uuid)));
    assert.deepEqual(competing.map(result => result.status).sort(), ['conflict', 'ok']);
    const after = await readLlmSettings();
    assert.equal(after.active.uuid, competing.find(result => result.status === 'ok').prompt.uuid);
    assert.equal(after.versions.length, 3);
    const restore = await activateLlmPrompt(author.uuid, original.activePrompt.uuid, after.active.uuid);
    assert.equal(restore.status, 'ok');
    assert.equal((await readLlmSettings()).active.systemPrompt, original.activePrompt.systemPrompt);
    assert.equal(await database.llmSettings.count(), 1);
    assert.equal((await database.llmSettings.findUniqueOrThrow({ where: { key: 'chat' } })).updatedByUuid, author.uuid);
  } finally {
    hooks.deregister();
    delete globalThis.__llmIntegrationDb;
  }
  console.log('PASS concurrent version saves, exactly one active prompt, stale activation rejection and rollback to an older version');
} finally {
  await database?.$disconnect();
  if (created) admin('drop');
  console.log('Disposable LLM settings database removed.');
}
