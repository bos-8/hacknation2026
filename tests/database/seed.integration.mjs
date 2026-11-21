import { composeArgs } from '../../scripts/lib/compose.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { createDatabaseClient } from '../../packages/database/dist/index.js';
import { seedDatabase, DEFAULT_SYSTEM_PROMPT, SYSTEM_KEY, SYSTEM_USER_KEY, SYSTEM_ROLES } from '../../packages/database/dist/seed.js';
import { CONFIG_DEFAULTS } from '../../packages/database/dist/config-contracts.js';

const infra = parseEnv(readFileSync('infra/local/.env.dev', 'utf8'));
const local = parseEnv(readFileSync('packages/database/.env', 'utf8'));
const source = new URL(local.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(source.hostname));
assert.equal(source.port, infra.DB_PORT);
assert.equal(decodeURIComponent(source.username), infra.DB_APP_USERNAME);
const prefix = `modulon_seed_${randomBytes(8).toString('hex')}`;
const names = [prefix, `${prefix}_other`];
const created = [];
const clients = [];
const uuidv7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function admin(operation, name) {
  assert.match(name, /^modulon_seed_[a-f0-9]{16}(?:_other)?$/);
  const command = operation === 'create'
    ? ['sh', '-c', 'exec createdb -U "$POSTGRES_USER" -O "$1" "$2"', 'seed-test', decodeURIComponent(source.username), name]
    : ['sh', '-c', 'exec dropdb -U "$POSTGRES_USER" --if-exists --force "$1"', 'seed-test', name];
  const result = spawnSync('docker', [...composeArgs(process.cwd(), 'dev', infra), 'exec', '-T', 'db', ...command], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, 'Disposable database administration failed; output hidden');
}
function prisma(url, ...args) {
  const cli = process.env.npm_execpath;
  assert.ok(cli, 'Run through pnpm test:database:integration');
  const script = /\.[cm]?js$/.test(cli);
  const command = ['--filter', '@formiq/database', 'exec', 'prisma', ...args, '--config', 'prisma.config.ts'];
  const result = spawnSync(script ? process.execPath : cli, script ? [cli, ...command] : command, {
    env: { ...process.env, DATABASE_URL: url, SHADOW_DATABASE_URL: '' }, encoding: 'utf8', windowsHide: true,
  });
  if (result.status !== 0) {
    const output = `${result.stdout}\n${result.stderr}`.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database URL hidden]');
    console.error(output.slice(-5000));
  }
  assert.equal(result.status, 0, 'Prisma migration/seed CLI failed');
}
const snapshot = async database => ({
  systems: await database.system.findMany({ orderBy: { key: 'asc' } }),
  roles: await database.role.findMany({ orderBy: { code: 'asc' } }),
  users: await database.user.findMany({ orderBy: { uuid: 'asc' } }),
  configs: await database.systemConfigVersion.findMany({ orderBy: { version: 'asc' } }),
  activations: await database.systemConfigActivation.findMany({ orderBy: { uuid: 'asc' } }),
  llmSettings: await database.llmSettings.findUnique({ where: { key: 'chat' }, include: { activePrompt: true } }),
  llmPrompts: await database.llmPromptVersion.findMany({ orderBy: { version: 'asc' } }),
});
try {
  for (const name of names) { admin('create', name); created.push(name); }
  const urls = names.map(name => { const url = new URL(source); url.pathname = `/${name}`; return url.href; });
  for (const url of urls) prisma(url, 'migrate', 'deploy');
  const databases = urls.map(connectionString => createDatabaseClient({ connectionString }));
  clients.push(...databases);
  prisma(urls[0], 'db', 'seed');
  const first = await snapshot(databases[0]);
  prisma(urls[0], 'db', 'seed');
  assert.deepEqual(await snapshot(databases[0]), first, 'Rerun preserves UUIDs, rows and timestamps');
  const skipped = await seedDatabase(databases[0]);
  assert.equal(skipped.status, 'unchanged');
  assert.deepEqual(skipped.created, { system: 0, roles: 0, systemUser: 0, configuration: 0, llmPrompt: 0 });
  const concurrent = await Promise.all(Array.from({ length: 4 }, () => seedDatabase(databases[1])));
  assert.equal(concurrent.reduce((count, result) => count + result.created.system, 0), 1);
  assert.equal(concurrent.reduce((count, result) => count + result.created.roles, 0), SYSTEM_ROLES.length);
  assert.equal(concurrent.reduce((count, result) => count + result.created.systemUser, 0), 1);
  assert.equal(concurrent.reduce((count, result) => count + result.created.configuration, 0), 1);
  assert.equal(concurrent.reduce((count, result) => count + result.created.llmPrompt, 0), 1);
  const second = await snapshot(databases[1]);
  for (const data of [first, second]) {
    assert.equal(data.llmSettings.activePrompt.systemPrompt, DEFAULT_SYSTEM_PROMPT);
    assert.equal(data.llmPrompts.length, 2);
    assert.equal(data.systems.length, 1);
    assert.equal(data.systems[0].key, SYSTEM_KEY);
    assert.deepEqual(data.roles.map(role => role.code).sort(), [...SYSTEM_ROLES].sort());
    for (const row of [...data.systems, ...data.roles]) assert.match(row.uuid, uuidv7);
    assert.equal(data.users.length, 1); assert.equal(data.users[0].systemKey, SYSTEM_USER_KEY); assert.equal(data.users[0].keycloakUuid, null);
    assert.match(data.users[0].uuid, uuidv7); assert.equal(data.configs.length, 1); assert.equal(data.activations.length, 1);
    const config = data.configs[0]; assert.match(config.uuid, uuidv7); assert.equal(config.version, 1); assert.equal(config.status, 'PUBLISHED');
    assert.equal(data.systems[0].activeConfigUuid, config.uuid);
    for (const key of ['createdByUuid','updatedByUuid','publishedByUuid']) assert.equal(config[key], data.users[0].uuid);
    assert.ok(config.publishedAt); assert.equal(config.archivedAt, null);
    for (const key of Object.keys(CONFIG_DEFAULTS).filter(key => !['name','description'].includes(key))) assert.equal(config[key], CONFIG_DEFAULTS[key]);
    assert.equal(data.activations[0].createdByUuid, data.users[0].uuid);
  }
  const identifiers = [...first.systems, ...first.roles, ...second.systems, ...second.roles].map(row => row.uuid);
  assert.equal(new Set(identifiers).size, (SYSTEM_ROLES.length + 1) * 2, 'Independent installations receive independent UUIDv7 values');
  for (const database of databases) {
    assert.equal(await database.user.count(), 1, 'Seeding provisions only the non-login SYSTEM actor');
    assert.equal(await database.account.count(), 0);
    assert.equal(await database.session.count(), 0);
    const systemUser = await database.user.findUniqueOrThrow({ where: { systemKey: SYSTEM_USER_KEY } });
    await assert.rejects(database.session.create({ data: { userUuid: systemUser.uuid, token: randomUUID(), expiresAt: new Date(Date.now() + 60000) } }));
    await assert.rejects(database.account.create({ data: { userUuid: systemUser.uuid, provider: 'keycloak', subject: randomUUID() } }));
    await assert.rejects(database.user.create({ data: {} }));
    await assert.rejects(database.user.update({ where: { uuid: systemUser.uuid }, data: { systemKey: null, keycloakUuid: randomUUID() } }));
  }
  const database = databases[0], actor = first.users[0];
  const custom = await database.systemConfigVersion.create({ data: { ...CONFIG_DEFAULTS, name: 'Operator configuration', monitoringIntervalSeconds: 300, version: 2, systemUuid: first.systems[0].uuid, status: 'PUBLISHED', createdByUuid: actor.uuid, updatedByUuid: actor.uuid, publishedAt: new Date(), publishedByUuid: actor.uuid } });
  await database.system.update({ where: { uuid: first.systems[0].uuid }, data: { activeConfigUuid: custom.uuid } });
  const configured = await snapshot(database); await seedDatabase(database); assert.deepEqual(await snapshot(database), configured, 'Seed preserves operator versions/settings/activation');
  const repairDatabase = databases[1];
  const beforeRepair = await snapshot(repairDatabase);
  const missingCode = SYSTEM_ROLES.at(-1);
  await repairDatabase.role.delete({ where: { code: missingCode } });
  const repaired = await seedDatabase(repairDatabase);
  assert.equal(repaired.status, 'seeded');
  assert.deepEqual(repaired.created, { system: 0, roles: 1, systemUser: 0, configuration: 0, llmPrompt: 0 });
  const afterRepair = await snapshot(repairDatabase);
  assert.deepEqual(afterRepair.roles.filter(role => role.code !== missingCode), beforeRepair.roles.filter(role => role.code !== missingCode));
  for (const key of ['systems', 'users', 'configs', 'activations', 'llmSettings', 'llmPrompts']) assert.deepEqual(afterRepair[key], beforeRepair[key]);
  assert.equal((await seedDatabase(repairDatabase)).status, 'unchanged');
  const previous = first.llmPrompts[0];
  await database.llmSettings.update({ where: { key: 'chat' }, data: { activePromptUuid: previous.uuid } });
  assert.equal((await seedDatabase(database)).llmPromptActivated, false);
  assert.equal((await snapshot(database)).llmSettings.activePrompt.uuid, previous.uuid);
  assert.equal((await seedDatabase(database, { activateLlmPrompt: true })).llmPromptActivated, true);
  const reactivated = await snapshot(database);
  assert.equal(reactivated.llmSettings.activePrompt.uuid, first.llmSettings.activePrompt.uuid);
  assert.equal(reactivated.llmPrompts.length, 2);
  console.log('PASS: check-before-insert CLI seed, unchanged reruns, missing-role-only repair, concurrent idempotence, UUIDv7 actors/configs, operator settings preserved and SYSTEM authentication blocked.');
} finally {
  await Promise.all(clients.map(client => client.$disconnect()));
  for (const name of created.reverse()) admin('drop', name);
  console.log('Disposable seed databases removed.');
}
