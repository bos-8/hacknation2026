import { composeArgs } from '../../scripts/lib/compose.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { JobQueue } from '../../packages/queue/dist/index.js';

const infra = parseEnv(readFileSync('infra/local/.env.dev', 'utf8'));
const source = new URL(parseEnv(readFileSync('packages/database/.env', 'utf8')).DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(source.hostname)); assert.equal(source.port, infra.DB_PORT);
const name = `modulon_queue_test_${randomBytes(8).toString('hex')}`;
assert.match(name, /^modulon_queue_test_[a-f0-9]{16}$/);
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

import { once } from 'node:events';
import { stopChild } from '../../scripts/lib/child-process.mjs';
let worker;
try {
 admin('create');created=true;
 queue=new JobQueue(url.href,{migrate:true,retryDelaySeconds:0,pollingIntervalSeconds:0.5});await queue.start();
 const require=createRequire(new URL('../../packages/queue/package.json',import.meta.url));
 const {PgBoss}=require('pg-boss');
 const {DIAGNOSTIC_QUEUE}=await import('../../packages/queue/dist/contracts.js');
 const policy=new PgBoss({connectionString:url.href,migrate:false,schedule:false});await policy.start();
 try{await policy.updateQueue(DIAGNOSTIC_QUEUE,{expireInSeconds:2,heartbeatSeconds:10,retryDelay:0});}finally{await policy.stop();}
 const source=new URL('../../packages/queue/dist/index.js',import.meta.url).href;
 worker=spawn(process.execPath,['--input-type=module','-e',`
  import {JobQueue} from ${JSON.stringify(source)};
  const queue=new JobQueue(process.env.RECOVERY_DATABASE_URL,{pollingIntervalSeconds:0.5});
  await queue.startWorker(async()=>{process.send('active');await new Promise(()=>{});});
 `],{env:{...process.env,RECOVERY_DATABASE_URL:url.href},windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
 const active=once(worker,'message');
 const id=await queue.enqueueDiagnostic(0,randomUUID(),'python');
 let timer;try{assert.equal((await Promise.race([active,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Worker activation timed out')),10000);})]))[0],'active');}finally{clearTimeout(timer);}
 // Deliberate crash, bypassing graceful draining. Only this owned fixture is killed.
 const exited=once(worker,'exit');worker.kill('SIGKILL');await exited;
 await queue.startWorker(async()=>({recovered:true}));
 const deadline=Date.now()+40000;let job;
 while(Date.now()<deadline){job=(await queue.list({...query,search:id})).jobs[0];if(job?.state==='completed')break;await delay(250);}
 assert.equal(job.state,'completed');assert.ok(job.retryCount>=1);
 console.log('PASS durable job is recovered and completed after its active worker is forcibly interrupted');
}finally{try{await stopChild(worker,{graceMs:100});await queue?.stop();}finally{if(created)admin('drop');}}
