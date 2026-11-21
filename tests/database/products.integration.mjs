import { composeArgs } from '../../scripts/lib/compose.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createDatabaseClient } from '../../packages/database/dist/index.js';

const infra = parseEnv(readFileSync('infra/local/.env.dev', 'utf8'));
const source = new URL(parseEnv(readFileSync('packages/database/.env', 'utf8')).DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(source.hostname));
assert.equal(source.port, infra.DB_PORT);
const name = `modulon_products_${randomBytes(8).toString('hex')}`;
assert.match(name, /^modulon_products_[a-f0-9]{16}$/);
const url = new URL(source); url.pathname = `/${name}`;
const require = createRequire(new URL('../../packages/database/package.json', import.meta.url));
const prisma = require.resolve('prisma/build/index.js');
const packagePath = fileURLToPath(new URL('../../packages/database/', import.meta.url));
let created = false;
let database;
function admin(operation) {
  const args = operation === 'create'
    ? ['sh', '-c', 'exec createdb -U "$POSTGRES_USER" -O "$1" "$2"', 'products-test', decodeURIComponent(source.username), name]
    : ['sh', '-c', 'exec dropdb -U "$POSTGRES_USER" --if-exists --force "$1"', 'products-test', name];
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
  const product = await database.product.create({ data: {
    code: 'PRD-TEST-001', name: 'Without image', price: '999999999999999.9999', createdByUuid: author.uuid, updatedByUuid: author.uuid,
  } });
  assert.match(product.uuid, /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
  assert.equal(product.price.toFixed(4), '999999999999999.9999');
  assert.equal(product.currency, 'PLN'); assert.equal(product.status, 'active');
  assert.equal(product.imageFileUuid, null); assert.equal(product.lastArchivedAt, null);
  await assert.rejects(database.product.create({ data: {
    code: product.code, name: 'Duplicate', price: '1', createdByUuid: author.uuid, updatedByUuid: author.uuid,
  } }), error => error.code === 'P2002');
  const file = await database.file.create({ data: { name: 'fixture.png', createdByUuid: author.uuid, updatedByUuid: author.uuid } });
  const revision=await database.fileVersion.create({data:{fileUuid:file.uuid,version:1,seaweedUuid:randomUUID(),size:BigInt('9007199254740993'),createdByUuid:author.uuid}});
  const revisionHistory=await database.changeHistory.findFirst({where:{entity:'file_version',entityUuid:revision.uuid}});
  assert.equal(revisionHistory.parentUuid,file.uuid);assert.equal(revisionHistory.after.size,'9007199254740993');
  const deleting = await database.file.create({ data: { name: 'deleting.png', deletingAt: new Date(),
    createdByUuid: author.uuid, updatedByUuid: author.uuid } });
  await assert.rejects(database.product.update({ where: { uuid: product.uuid },
    data: { imageFileUuid: deleting.uuid } }), error => error.code === 'P2003');
  const image = await database.product.update({ where: { uuid: product.uuid }, data: { imageFileUuid: file.uuid, price: '12.3456', currency: 'EUR' } });
  assert.equal(image.price.toFixed(4), '12.3456');
  await assert.rejects(database.file.delete({ where: { uuid: file.uuid } }), error => error.code === 'P2003');
  await assert.rejects(database.user.delete({ where: { uuid: author.uuid } }), error => error.code === 'P2003');
  // A deletion lock must also stop a concurrent product from attaching this file.
  await database.product.update({ where: { uuid: product.uuid }, data: { imageFileUuid: null } });
  let releaseLock;
  let lockReady;
  const ready = new Promise(resolve => { lockReady = resolve; });
  const release = new Promise(resolve => { releaseLock = resolve; });
  const locked = database.$transaction(async transaction => {
    await transaction.$queryRaw`SELECT "uuid" FROM "file" WHERE "uuid" = ${file.uuid}::uuid FOR UPDATE`;
    lockReady(); await release;
  });
  await ready;
  try {
    await assert.rejects(database.$transaction(async transaction => {
      await transaction.$executeRaw`SET LOCAL lock_timeout = '250ms'`;
      await transaction.product.update({ where: { uuid: product.uuid }, data: { imageFileUuid: file.uuid } });
    }));
  } finally { releaseLock(); await locked; }
  const archivedAt = new Date();
  await database.product.update({ where: { uuid: product.uuid }, data: { status: 'archived', lastArchivedAt: archivedAt } });
  const restored = await database.product.update({ where: { uuid: product.uuid }, data: { status: 'active' } });
  assert.equal(restored.lastArchivedAt.getTime(), archivedAt.getTime());
  const history = await database.changeHistory.findMany({where:{entity:'product',entityUuid:product.uuid},orderBy:{uuid:'asc'}});
  assert.ok(history.length>=5);
  assert.equal(history[0].operation,'INSERT');assert.equal(history[0].actorUuid,author.uuid);
  assert.equal(history[0].after.price,'999999999999999.9999');
  assert.equal(history[0].before,null);assert.equal(history[0].after.name,'Without image');
  assert.ok(history.some(item=>item.before?.price!==item.after?.price));
  await assert.rejects(database.$transaction(async tx=>{
    await tx.product.update({where:{uuid:product.uuid},data:{name:'Rollback fixture'}});
    throw Error('rollback');
  }));
  assert.equal(await database.changeHistory.count({where:{entity:'product',entityUuid:product.uuid}}),history.length);
  const secondAuthor=await database.user.create({data:{keycloakUuid:randomUUID()}});
  assert.equal((await database.product.deleteMany({where:{uuid:product.uuid,status:'active',updatedAt:image.updatedAt}})).count,0);
  await database.$transaction(async tx=>{
    await tx.$executeRaw`SELECT set_config('app.actor_uuid', ${secondAuthor.uuid}, true)`;
    assert.equal((await tx.product.deleteMany({where:{uuid:product.uuid,updatedAt:restored.updatedAt}})).count,1);
  });
  const deletion=await database.changeHistory.findFirst({where:{entity:'product',entityUuid:product.uuid,operation:'DELETE'}});
  assert.equal(deletion.actorUuid,secondAuthor.uuid);assert.equal(deletion.after,null);assert.equal(deletion.before.price,'12.3456');
  await assert.rejects(database.$queryRaw`SELECT pg_sleep(7)`);
  console.log('PASS transactional before/after history, verified actor, rollback and server-side SQL deadline');
  console.log('PASS: generated migration, UUIDv7, exact Decimal, optional image, unique code, audit/image FKs, archival timestamp and concurrent image attachment lock.');
} finally {
  await database?.$disconnect();
  if (created) admin('drop');
  console.log('Disposable products database removed.');
}
