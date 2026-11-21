import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { pyworkerDirectory, pyworkerEnvironment } from '../../scripts/pyworker.mjs';
import { stopChild } from '../../scripts/lib/child-process.mjs';

const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const token=randomBytes(32).toString('hex');
const fixture=`import asyncio
import pyworker.main as worker
original = worker.run_check
async def slow_check(task):
    print('fixture_active', flush=True)
    await asyncio.sleep(1.5)
    return await original(task)
worker.run_check = slow_check
from pyworker.__main__ import main
main()
`;
const python=path.join(pyworkerDirectory,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const child=spawn(python,['-c',fixture],{cwd:pyworkerDirectory,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...await pyworkerEnvironment(),PYWORKER_PORT:String(port),PYWORKER_API_TOKEN:token,PYWORKER_PARENT_CONTROL:'stdin'}});
let log='';child.stdout.on('data',data=>{log+=data;});child.stderr.on('data',data=>{log+=data;});child.stdin.on('error',()=>{});
const endpoint=`http://127.0.0.1:${port}`;
async function waitFor(predicate){const end=Date.now()+20000;while(Date.now()<end){if(await predicate())return;if(child.exitCode!==null)throw Error('Worker exited early');await delay(50);}throw Error('Worker fixture timed out');}
try{
 await waitFor(async()=>{try{return(await fetch(endpoint+'/health/ready',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}});
 const response=fetch(endpoint+'/v1/tasks/check',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({job_id:randomUUID(),attempt:0}),signal:AbortSignal.timeout(10000)});
 await waitFor(()=>log.includes('fixture_active'));
 const started=Date.now();await stopChild(child);
 assert.equal((await response).status,200);assert.equal(child.exitCode,0);assert.ok(Date.now()-started>1000);
 assert.ok(log.includes('event=worker_stopped'));
 console.log('PASS Python process drains an active HTTP task before shutdown, including Windows stdin control');
}finally{await stopChild(child);}
