import { composeArgs } from '../../scripts/lib/compose.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { JobQueue } from '../../packages/queue/dist/index.js';

const infra = parseEnv(readFileSync('infra/local/.env.dev', 'utf8'));
const source = new URL(parseEnv(readFileSync('packages/database/.env', 'utf8')).DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(source.hostname)); assert.equal(source.port, infra.DB_PORT);
const name = `modulon_queue_actions_${randomBytes(8).toString('hex')}`;
assert.match(name, /^modulon_queue_actions_[a-f0-9]{16}$/);
const url = new URL(source); url.pathname = '/' + name; url.search = '';
let queue, created = false;
function admin(operation) {
  const args = operation === 'create'
    ? ['sh', '-c', 'exec createdb -U "$POSTGRES_USER" -O "$1" "$2"', 'queue-test', decodeURIComponent(source.username), name]
    : ['sh', '-c', 'exec dropdb -U "$POSTGRES_USER" --if-exists --force "$1"', 'queue-test', name];
  const result = spawnSync('docker', [...composeArgs(process.cwd(), 'dev', infra), 'exec', '-T', 'db', ...args], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, 'Disposable queue database operation failed; output hidden');
}
const query = { page: 1, limit: 25, search: '' };
try {
 admin('create');created=true;
 queue=new JobQueue(url.href,{migrate:true,retryDelaySeconds:0,pollingIntervalSeconds:0.5});await queue.start();
 const actor=randomUUID();
 const row=async id=>(await queue.list({...query,search:id})).jobs[0];
 const input=(job,operation)=>({id:job.id,name:job.name,operation,expectedState:job.state,expectedRetryCount:job.retryCount,expectedAdminActionUuid:job.adminActionUuid});
 const id=await queue.enqueueDiagnostic(0,actor);let job=await row(id);const original=input(job,'cancel');
 assert.equal((await queue.changeJob(original,actor)).status,'ok');job=await row(id);assert.equal(job.state,'cancelled');assert.ok(job.adminActionUuid);
 assert.equal((await queue.changeJob(original,actor)).status,'conflict');
 assert.equal((await queue.changeJob(input(job,'resume'),actor)).status,'ok');job=await row(id);assert.equal(job.state,'created');
 const require=createRequire(new URL('../../packages/queue/package.json',import.meta.url));const {Pool}=require('pg');const inspector=new Pool({connectionString:url.href,max:1});
 try{
  await inspector.query("UPDATE pgboss.job SET state='active',started_on=now() WHERE id=$1",[id]);job=await row(id);
  for(const operation of ['delete','cancel','retry','repeat','resume'])assert.equal((await queue.changeJob(input(job,operation),actor)).status,'conflict');
  await inspector.query("UPDATE pgboss.job SET state='created',started_on=NULL WHERE id=$1",[id]);job=await row(id);
  assert.equal((await queue.changeJob(input(job,'delete'),actor)).status,'ok');assert.equal(await row(id),undefined);
  const failure=await queue.enqueueDiagnostic(4,actor);const success=await queue.enqueueDiagnostic(0,actor);await queue.startWorker();
  async function waitState(id,state){const end=Date.now()+60000;while(Date.now()<end){const value=await row(id);if(value?.state===state)return value;await delay(250);}throw Error('Timed out waiting for job state');}
  let failed=await waitState(failure,'failed');assert.equal(failed.retryCount,3);
  assert.equal((await queue.changeJob(input(failed,'retry'),actor)).status,'ok');const recovered=await waitState(failure,'completed');assert.equal(recovered.retryCount,4);assert.equal(recovered.retryLimit,4);
  const completed=await waitState(success,'completed');const repeated=await Promise.all([queue.changeJob(input(completed,'repeat'),actor),queue.changeJob(input(completed,'repeat'),actor)]);
  assert.equal(repeated.filter(result=>result.status==='ok').length,1);assert.equal(repeated.filter(result=>result.status==='conflict').length,1);
  const newId=repeated.find(result=>result.status==='ok').id;assert.notEqual(newId,success);await waitState(newId,'completed');
  const copied=(await inspector.query('SELECT data FROM pgboss.job WHERE id=$1',[newId])).rows[0].data;assert.equal(copied.actorUuid,actor);assert.equal(copied.repeatedFromUuid,success);
  await queue.stop();queue=new JobQueue(url.href,{schedule:true});await queue.start();await queue.startMonitoring(async()=>{},async()=>{});
  const monitor=(await queue.list({...query,search:'monitoring.collect'})).jobs[0];assert.ok(monitor);
  await inspector.query("UPDATE pgboss.job SET state='failed' WHERE id=$1",[monitor.id]);const oldMonitor=await row(monitor.id);
  assert.equal((await queue.changeJob(input(oldMonitor,'retry'),actor,randomUUID())).status,'inactiveConfig');
  assert.equal((await queue.changeJob({...input(oldMonitor,'delete'),name:'arbitrary.command'},actor)).status,'invalid');
  console.log('PASS cancel/resume/delete, active-job protection, one extra failed attempt, concurrent repeat idempotence, audit actor and inactive configuration guard');
 }finally{await inspector.end();}
}finally{await queue?.stop().catch(()=>{});if(created)admin('drop');}