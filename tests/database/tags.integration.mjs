import { composeArgs } from '../../scripts/lib/compose.mjs';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { createDatabaseClient } from '../../packages/database/dist/index.js';

const infra = parseEnv(readFileSync('infra/local/.env.dev', 'utf8'));
const source = new URL(parseEnv(readFileSync('packages/database/.env', 'utf8')).DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(source.hostname)); assert.equal(source.port, infra.DB_PORT);
const name = `modulon_tags_${randomBytes(8).toString('hex')}`;
const url = new URL(source); url.pathname = `/${name}`;
const require = createRequire(new URL('../../packages/database/package.json', import.meta.url));
const prisma = require.resolve('prisma/build/index.js');
const packagePath = fileURLToPath(new URL('../../packages/database/', import.meta.url));
const migrations = join(packagePath, 'prisma/migrations');
const temporary = mkdtempSync(join(tmpdir(), 'modulon-tags-'));
let created = false, database;
function admin(operation) {
  const args = operation === 'create'
    ? ['sh', '-c', 'exec createdb -U "$POSTGRES_USER" -O "$1" "$2"', 'tags-test', decodeURIComponent(source.username), name]
    : ['sh', '-c', 'exec dropdb -U "$POSTGRES_USER" --if-exists --force "$1"', 'tags-test', name];
  assert.equal(spawnSync('docker', [...composeArgs(process.cwd(), 'dev', infra), 'exec', '-T', 'db', ...args], { encoding: 'utf8', windowsHide: true }).status, 0, 'Disposable DB operation failed; output hidden');
}
function deploy(config) {
  const run = spawnSync(process.execPath, [prisma, 'migrate', 'deploy', '--config', config], {
    cwd: packagePath, env: { ...process.env, DATABASE_URL: url.href, SHADOW_DATABASE_URL: '' }, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(run.status, 0, 'Disposable migration failed; output hidden');
}
try {
  // First deploy the prior schema to prove existing tags/assignments survive backfill.
  for (const entry of readdirSync(migrations)) if (!entry.endsWith('_tag_colors') && !entry.endsWith('_tag_status')) cpSync(join(migrations, entry), join(temporary, 'migrations', entry), { recursive: true });
  const config = join(temporary, 'prisma.config.mjs');
  writeFileSync(config, `import {defineConfig} from ${JSON.stringify(pathToFileURL(require.resolve('prisma/config')).href)};\nexport default defineConfig({schema:${JSON.stringify(join(packagePath, 'prisma/schema.prisma'))},migrations:{path:${JSON.stringify(join(temporary, 'migrations'))}},datasource:{url:process.env.DATABASE_URL}});\n`);
  admin('create'); created = true; deploy(config);
  database = createDatabaseClient({ connectionString: url.href });
  const actor = await database.user.create({ data: { keycloakUuid: randomUUID() } });
  const file = await database.file.create({ data: { name: 'tag-fixture.txt', createdByUuid: actor.uuid, updatedByUuid: actor.uuid } });
  const [old] = await database.$queryRaw`INSERT INTO "tag" ("name", "created_by", "updated_by", "updated_at") VALUES ('Legacy tag', ${actor.uuid}::uuid, ${actor.uuid}::uuid, now()) RETURNING "uuid"`;
  await database.fileTag.create({ data: { fileUuid: file.uuid, tagUuid: old.uuid } });
  deploy('prisma.config.ts');
  const retained = await database.tag.findUnique({ where: { uuid: old.uuid }, include: { _count: { select: { files: true } } } });
  assert.equal(retained.color, '#64748B'); assert.equal(retained.status, 'active'); assert.equal(retained.name, 'Legacy tag'); assert.equal(retained._count.files, 1);
  assert.equal(retained.createdByUuid, actor.uuid);
  const tag = await database.tag.create({ data: { name: 'New tag', color: '#22C55E', createdByUuid: actor.uuid, updatedByUuid: actor.uuid } });
  assert.match(tag.uuid, /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
  assert.equal(tag.color, '#22C55E'); assert.equal(tag.status, 'active');
  const changed = await database.tag.updateMany({ where: { uuid: tag.uuid, updatedAt: tag.updatedAt }, data: { color: '#3B82F6', status: 'inactive' } });
  assert.equal(changed.count, 1);
  assert.equal((await database.tag.findUnique({where:{uuid:tag.uuid}})).status,'inactive');
  assert.equal((await database.tag.updateMany({ where: { uuid: tag.uuid, updatedAt: tag.updatedAt }, data: { name: 'Stale' } })).count, 0);
  await assert.rejects(database.tag.create({ data: { name: 'New tag', createdByUuid: actor.uuid, updatedByUuid: actor.uuid } }), error => error.code === 'P2002');
  console.log('PASS tag migration preserves legacy data/assignments, backfills color and supports UUIDv7/unique/CAS writes');
} finally {
  await database?.$disconnect();
  if (created) admin('drop');
  assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + '\\') || resolve(temporary).startsWith(resolve(tmpdir()) + '/'));
  rmSync(temporary, { recursive: true, force: true });
}
