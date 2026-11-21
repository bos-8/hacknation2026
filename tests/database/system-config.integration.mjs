import { composeArgs } from '../../scripts/lib/compose.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { createDatabaseClient, saveSystemConfig, changeSystemConfig, listSystemConfigs, ocrPollSeconds, activeSystemConfig, reconcileSystemConfig, runActiveSystemConfig } from '../../packages/database/dist/index.js';
import { cleanupHealth, readHealth } from '../../packages/monitoring/dist/index.js';

const infra=parseEnv(readFileSync('infra/local/.env.dev','utf8'));
const source=new URL(parseEnv(readFileSync('packages/database/.env','utf8')).DATABASE_URL);
assert.ok(['localhost','127.0.0.1'].includes(source.hostname));assert.equal(source.port,infra.DB_PORT);
const name=`modulon_config_${randomBytes(8).toString('hex')}`;
const target=new URL(source);target.pathname=`/${name}`;
const require=createRequire(new URL('../../packages/database/package.json',import.meta.url));
let created=false,db;
function admin(create){
 const command=create ? ['sh','-c','exec createdb -U "$POSTGRES_USER" -O "$1" "$2"','monitor-test',decodeURIComponent(source.username),name]
 : ['sh','-c','exec dropdb -U "$POSTGRES_USER" --if-exists --force "$1"','monitor-test',name];
 assert.equal(spawnSync('docker',[...composeArgs(process.cwd(), 'dev', infra),'exec','-T','db',...command],{encoding:'utf8',windowsHide:true}).status,0,'Disposable database operation failed');
}
import { CONFIG_DEFAULTS } from '../../packages/database/dist/config-contracts.js';
try{
 admin(true);created=true;
 const deployed=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--config','prisma.config.ts'],{cwd:new URL('../../packages/database/',import.meta.url),env:{...process.env,DATABASE_URL:target.href,SHADOW_DATABASE_URL:''},encoding:'utf8',windowsHide:true});
 assert.equal(deployed.status,0,'Disposable configuration migration failed; output hidden');
 db=createDatabaseClient({connectionString:target.href});
 const system=await db.system.create({data:{key:'formiq'}});
 const actor=await db.user.create({data:{keycloakUuid:randomUUID()}});
 const other=await db.user.create({data:{keycloakUuid:randomUUID()}});
 assert.equal(await activeSystemConfig(db),null);
 assert.equal(await ocrPollSeconds(db),10);
 assert.equal((await saveSystemConfig(db,{...CONFIG_DEFAULTS,ocrPollSeconds:0},actor.uuid)).status,"invalid");
 let applied='initial';await reconcileSystemConfig(db,'test-worker',async config=>{applied=config;});assert.equal(applied,null);
 assert.equal((await saveSystemConfig(db,{...CONFIG_DEFAULTS,historyRetentionDays:8},actor.uuid)).status,'invalid');
 const creations=await Promise.all([saveSystemConfig(db,{...CONFIG_DEFAULTS,monitoringIntervalSeconds:300,ocrPollSeconds:7,name:'First',createdByUuid:other.uuid,status:'PUBLISHED'},actor.uuid),saveSystemConfig(db,{...CONFIG_DEFAULTS,monitoringIntervalSeconds:300,ocrPollSeconds:7,name:'Second'},actor.uuid)]);
 assert.ok(creations.every(result=>result.status==='ok'));
 let versions=await db.systemConfigVersion.findMany({orderBy:{version:'asc'}});assert.deepEqual(versions.map(row=>row.version),[1,2]);assert.ok(versions.every(row=>row.createdByUuid===actor.uuid&&row.status==='DRAFT'));
 let row=versions[0];const originalStamp=row.updatedAt.toISOString();
 assert.equal((await saveSystemConfig(db,{...CONFIG_DEFAULTS,monitoringIntervalSeconds:300,ocrPollSeconds:7,name:'Changed'},other.uuid,{uuid:row.uuid,expectedUpdatedAt:originalStamp})).status,'ok');
 assert.equal((await saveSystemConfig(db,CONFIG_DEFAULTS,actor.uuid,{uuid:row.uuid,expectedUpdatedAt:originalStamp})).status,'conflict');
 async function transition(uuid,operation,expectedActiveUuid=null){const row=await db.systemConfigVersion.findUniqueOrThrow({where:{uuid}});return changeSystemConfig(db,{uuid,expectedUpdatedAt:row.updatedAt.toISOString(),operation,expectedActiveUuid},actor.uuid);}
 for(const row of versions)assert.equal((await transition(row.uuid,'publish')).status,'ok');
 versions=await db.systemConfigVersion.findMany({orderBy:{version:'asc'}});
 assert.ok(versions.every(row=>row.publishedAt&&row.publishedByUuid===actor.uuid));
 assert.equal((await saveSystemConfig(db,CONFIG_DEFAULTS,actor.uuid,{uuid:versions[0].uuid,expectedUpdatedAt:versions[0].updatedAt.toISOString()})).status,'conflict');
 const races=await Promise.all(versions.map(row=>transition(row.uuid,'activate')));assert.equal(races.filter(result=>result.status==='ok').length,1);assert.equal(races.filter(result=>result.status==='conflict').length,1);
 const active=await activeSystemConfig(db);const inactive=versions.find(row=>row.uuid!==active.uuid);
 assert.equal(await ocrPollSeconds(db),7);
 await assert.rejects(db.systemConfigVersion.update({where:{uuid:active.uuid},data:{ocrPollSeconds:2}}));
 assert.equal((await transition(active.uuid,'archive',active.uuid)).status,'conflict');
 await assert.rejects(db.system.update({where:{uuid:system.uuid},data:{activeConfigUuid:null}}));
 await assert.rejects(db.systemConfigVersion.update({where:{uuid:active.uuid},data:{monitoringIntervalSeconds:600}}));
 await assert.rejects(db.systemConfigVersion.update({where:{uuid:active.uuid},data:{status:'ARCHIVED',archivedAt:new Date(),archivedByUuid:actor.uuid}}));
 const foreign=await db.system.create({data:{key:'another-system'}});
 await assert.rejects(db.system.update({where:{uuid:foreign.uuid},data:{activeConfigUuid:inactive.uuid}}));
 assert.equal((await transition(inactive.uuid,'activate',active.uuid)).status,'ok');
 assert.equal((await transition(active.uuid,'activate',inactive.uuid)).status,'ok');
 assert.equal((await transition(inactive.uuid,'archive',active.uuid)).status,'ok');
 const archived=await db.systemConfigVersion.findUniqueOrThrow({where:{uuid:inactive.uuid}});assert.ok(archived.archivedAt);assert.equal(archived.archivedByUuid,actor.uuid);
 assert.equal((await transition(inactive.uuid,'activate',active.uuid)).status,'conflict');
 const clone=await transition(active.uuid,'clone',active.uuid);assert.equal(clone.status,'ok');const copy=await db.systemConfigVersion.findUniqueOrThrow({where:{uuid:clone.uuid}});assert.equal(copy.version,3);assert.equal(copy.status,'DRAFT');assert.equal(copy.publishedAt,null);
 await assert.rejects(db.system.update({where:{uuid:system.uuid},data:{activeConfigUuid:copy.uuid}}));
 await reconcileSystemConfig(db,'test-worker',async config=>{applied=config.uuid;});assert.equal(applied,active.uuid);
 let executed=0;
 assert.deepEqual(await runActiveSystemConfig(db,undefined,async()=>{executed++;}),{skipped:true});
 assert.deepEqual(await runActiveSystemConfig(db,inactive.uuid,async()=>{executed++;}),{skipped:true});
 assert.deepEqual(await runActiveSystemConfig(db,copy.uuid,async()=>{executed++;}),{skipped:true});
 await runActiveSystemConfig(db,active.uuid,async()=>{executed++;});assert.equal(executed,1);
 const worker=await db.systemConfigWorker.findUniqueOrThrow({where:{workerKey:'test-worker'}});assert.equal(worker.appliedConfigUuid,active.uuid);assert.ok(worker.appliedAt);
 await assert.rejects(reconcileSystemConfig(db,'failed-worker',async()=>{throw Error('Controlled apply failure');}));assert.equal(await db.systemConfigWorker.count({where:{workerKey:'failed-worker'}}),0);
 const page=await listSystemConfigs(db,{page:1,limit:25,search:''});assert.equal(page.total,3);assert.equal(page.activeUuid,active.uuid);assert.equal(page.activations.length,3);assert.equal(page.versions[0].version,3);
 assert.equal((await listSystemConfigs(db,{page:1,limit:25,search:'',status:'DRAFT'})).total,1);
 const now=new Date();await db.serviceHealthSample.createMany({data:[{service:'web',status:'healthy',reason:'ok',checkedAt:new Date(now.getTime()-240000),expiresAt:new Date(now.getTime()+86400000)}, {service:'storage',status:'healthy',reason:'ok',checkedAt:new Date(now.getTime()-4*86400000),expiresAt:new Date(now.getTime()+86400000)}]});
 const health=await readHealth(db,now);assert.equal(health.staleAfterMs,900000);assert.equal(health.services.find(row=>row.service==='web').status,'healthy');
 assert.equal((await cleanupHealth(db,now,3)).count,1);
 console.log('PASS configuration migration, validation, audit, concurrent numbering/activation, immutable published settings, active archive protection, rollback, cloning and worker acknowledgement');
}finally{await db?.$disconnect();if(created)admin(false);}
