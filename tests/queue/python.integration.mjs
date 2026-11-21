import { composeArgs } from '../../scripts/lib/compose.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { JobQueue } from '../../packages/queue/dist/index.js';

const infra = parseEnv(readFileSync('infra/local/.env.dev', 'utf8'));
const source = new URL(parseEnv(readFileSync('packages/database/.env', 'utf8')).DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(source.hostname)); assert.equal(source.port, infra.DB_PORT);
const name = `modulon_python_test_${randomBytes(8).toString('hex')}`;
assert.match(name, /^modulon_python_test_[a-f0-9]{16}$/);
const url = new URL(source); url.pathname = '/' + name; url.search = '';
let queue, created = false;
function admin(operation) {
  const args = operation === 'create'
    ? ['sh', '-c', 'exec createdb -U "$POSTGRES_USER" -O "$1" "$2"', 'queue-test', decodeURIComponent(source.username), name]
    : ['sh', '-c', 'exec dropdb -U "$POSTGRES_USER" --if-exists --force "$1"', 'queue-test', name];
  const result = spawnSync('docker', [...composeArgs(process.cwd(), 'dev', infra), 'exec', '-T', 'db', ...args], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(result.status, 0, 'Disposable queue database operation failed; output hidden');
}
const query = { page: 1, limit: 25, search: '' };
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { stopChild } from '../../scripts/lib/child-process.mjs';
import path from 'node:path';
import { createPythonExecutor } from '../../scripts/lib/pyworker-client.mjs';
import { pyworkerEnvironment, pyworkerDirectory } from '../../scripts/pyworker.mjs';
const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const token=randomBytes(32).toString('hex');const endpoint=`http://127.0.0.1:${port}`;
const python=path.join(pyworkerDirectory,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const child=spawn(python,['-m','pyworker'],{cwd:pyworkerDirectory,windowsHide:true,env:{...await pyworkerEnvironment(),PYWORKER_PORT:String(port),PYWORKER_API_TOKEN:token},stdio:'ignore'});
let childError;child.once('error',()=>{childError=true;});
try {
 const deadline=Date.now()+20000;let ready=false;while(Date.now()<deadline){if(childError||child.exitCode!==null||child.signalCode)throw Error('Python fixture could not start');try{if((await fetch(endpoint+'/health/ready',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await delay(100);}assert.ok(ready,'Python readiness timed out');
 admin('create');created=true;queue=new JobQueue(url.href,{migrate:true,retryDelaySeconds:0,pollingIntervalSeconds:0.5});await queue.start();
 try {
  const result = await promisify(execFile)(python, [path.join(pyworkerDirectory, 'tests/postgresql_integration.py')], {
   windowsHide: true, timeout: 30000, maxBuffer: 8192,
   env: { ...await pyworkerEnvironment(), PYWORKER_DATABASE_URL: url.href },
  });
  console.log(result.stdout.trim());
 } catch { throw new Error('Disposable Python PostgreSQL helper integration failed; driver output hidden'); }
 const actor=randomUUID();const id=await queue.enqueueDiagnostic(1,actor,'python');
 await queue.startWorker(createPythonExecutor({PYWORKER_URL:endpoint,PYWORKER_API_TOKEN:token}));
 let job;const end=Date.now()+30000;while(Date.now()<end){job=(await queue.list({...query,search:id})).jobs[0];if(job.state==='completed')break;await delay(250);}
 assert.equal(job.state,'completed');assert.equal(job.retryCount,1);assert.equal(job.executor,'python');
 const repeat=await queue.changeJob({id:job.id,name:job.name,operation:'repeat',expectedState:job.state,expectedRetryCount:job.retryCount,expectedAdminActionUuid:job.adminActionUuid},actor);assert.equal(repeat.status,'ok');
 let copy;const endCopy=Date.now()+30000;while(Date.now()<endCopy){copy=(await queue.list({...query,search:repeat.id})).jobs[0];if(copy.state==='completed')break;await delay(250);}
 assert.equal(copy.state,'completed');assert.equal(copy.executor,'python');assert.equal(copy.retryCount,1);
 await assert.rejects(createPythonExecutor({PYWORKER_URL:endpoint,PYWORKER_API_TOKEN:'x'.repeat(32)})({id,attempt:0}),/401/);
 console.log('PASS Python health, authenticated task execution through durable PostgreSQL jobs, retries and repeat preserving Python executor');
}finally{try{await queue?.stop();}finally{try{await stopChild(child);}finally{if(created)admin('drop');}}}
