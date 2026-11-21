import { composeArgs } from '../../scripts/lib/compose.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { createDatabaseClient } from '../../packages/database/dist/index.js';
import { cleanupHealth, readHealth, collectHealth, RETENTION_MS } from '../../packages/monitoring/dist/index.js';

const infra=parseEnv(readFileSync('infra/local/.env.dev','utf8'));
const source=new URL(parseEnv(readFileSync('packages/database/.env','utf8')).DATABASE_URL);
assert.ok(['localhost','127.0.0.1'].includes(source.hostname));assert.equal(source.port,infra.DB_PORT);
const name=`modulon_monitor_${randomBytes(8).toString('hex')}`;
const target=new URL(source);target.pathname=`/${name}`;
const require=createRequire(new URL('../../packages/database/package.json',import.meta.url));
let created=false,db;
function admin(create){
 const command=create ? ['sh','-c','exec createdb -U "$POSTGRES_USER" -O "$1" "$2"','monitor-test',decodeURIComponent(source.username),name]
 : ['sh','-c','exec dropdb -U "$POSTGRES_USER" --if-exists --force "$1"','monitor-test',name];
 assert.equal(spawnSync('docker',[...composeArgs(process.cwd(), 'dev', infra),'exec','-T','db',...command],{encoding:'utf8',windowsHide:true}).status,0,'Disposable database operation failed');
}
try{
 admin(true);created=true;
 const deployed=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--config','prisma.config.ts'],{
  cwd:new URL('../../packages/database/',import.meta.url),env:{...process.env,DATABASE_URL:target.href,SHADOW_DATABASE_URL:''},encoding:'utf8',windowsHide:true});
 assert.equal(deployed.status,0,'Disposable migration failed; output hidden');
 db=createDatabaseClient({connectionString:target.href});
 const now=new Date('2026-11-13T12:00:30Z');
 const point=(service,status,age)=>({service,status,checkedAt:new Date(now.getTime()-age),expiresAt:new Date(now.getTime()-age+RETENTION_MS),responseMs:20,reason:'ok'});
 await db.serviceHealthSample.createMany({data:[point('web','error',60000),point('web','healthy',0),point('backend','healthy',240000),point('keycloak','error',10*3600000),point('database','healthy',RETENTION_MS+1000)]});
 const overview=await readHealth(db,now,168);
 assert.equal(overview.services.length,7);
 const web=overview.services.find(row=>row.service==='web');
 assert.equal(web.status,'healthy');assert.equal(web.buckets.length,84);assert.equal(web.buckets.at(-1).status,'error');
 assert.equal(web.buckets.at(-1).count,2);assert.equal(web.buckets[0].status,'unknown');
 assert.equal(overview.services.find(row=>row.service==='backend').status,'unknown');
 assert.equal(overview.services.find(row=>row.service==='database').status,'unknown');
 const defaultView=await readHealth(db,now);assert.equal(defaultView.hours,8);
 for(const [hours,buckets] of [[8,96],[24,96],[72,72],[168,84]]){
  const view=await readHealth(db,now,hours);const row=view.services.find(row=>row.service==='web');
  assert.equal(row.buckets.length,buckets);assert.equal(row.buckets[0].from.getTime(),now.getTime()-hours*3600000);
  assert.equal(row.buckets.at(-1).to.getTime(),now.getTime());
  const count=view.services.find(row=>row.service==='keycloak').buckets.reduce((sum,bucket)=>sum+bucket.count,0);
  assert.equal(count,hours===8?0:1);
 }
 await assert.rejects(readHealth(db,now,9),/Invalid history window/);
 assert.equal((await cleanupHealth(db,now)).count,1);assert.equal(await db.serviceHealthSample.count(),4);
 await collectHealth(db,{},async()=>true,now);await collectHealth(db,{},async()=>true,now);
 assert.equal(await db.serviceHealthSample.count({where:{service:'pyworker'}}),1);
 assert.equal((await db.serviceHealthSample.findFirst({where:{service:'pyworker'}})).status,'unconfigured');
 assert.match((await db.serviceHealthSample.findFirst()).uuid,/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
 console.log('PASS migrations, UUIDv7, worst-status aggregation, stale/empty history, idempotent minute sampling and 7-day cleanup');
}finally{await db?.$disconnect();if(created)admin(false);}
