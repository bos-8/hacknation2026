import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { VolumeBackup } from '../../scripts/lib/volume-backup.mjs';

test('offline backup verifies ownership and hashes; restore creates fresh targets and rejects tampering', async t => {
 const root=await mkdtemp(path.join(os.tmpdir(),'modulon-backup-test-'));
 t.after(async()=>{const resolved=await realpath(root);assert.equal(path.dirname(resolved).toLowerCase(),(await realpath(os.tmpdir())).toLowerCase());assert.ok(path.basename(resolved).startsWith('modulon-backup-test-'));await rm(resolved,{recursive:true,force:true});});
 const calls=[];const project='fixture';
 const volumes=['postgres-data','seaweed-data','s3console-data'].map(role=>({role,name:`fixture-${role}`}));
 const docker=async args=>{
  calls.push(args);
  if(args[0]==='volume'&&args[1]==='inspect')return JSON.stringify([{Driver:'local',Labels:{'com.docker.compose.project':project}}]);
  if(args[0]==='image')return JSON.stringify([{Id:'sha256:'+'a'.repeat(64)}]);
  if(args[0]==='run'&&args.includes('-cpf')){
   const mount=args.find(arg=>arg.startsWith('type=bind,src='));const directory=mount.split(',dst=')[0].slice('type=bind,src='.length);
   const file=args[args.indexOf('-cpf')+1].slice('/backup/'.length);await writeFile(path.join(directory,file),'archive fixture');
  }
  return '';
 };
 const backup=new VolumeBackup({root,docker});
 const directory=await backup.create({project,volumes,image:'postgres:fixture'});
 const restored=await backup.restore(directory);
 assert.ok(restored.volumes.every(volume=>volume.name.startsWith(restored.project+'-')));
 assert.ok(!restored.volumes.some(volume=>volumes.some(original=>original.name===volume.name)));
 assert.equal(calls.filter(args=>args.includes('-xpf')).length,3);
 const withoutConsole=await backup.create({project,volumes:volumes.slice(0,2),image:'postgres:fixture'});
 assert.equal((await backup.restore(withoutConsole)).volumes.length,2,'QA without a console still backs up all three PostgreSQL databases and storage');
 await writeFile(path.join(directory,'postgres-data.tar'),'tampered');
 const count=calls.length;await assert.rejects(backup.restore(directory),/integrity/);assert.equal(calls.length,count);
});

test('active consumers prevent backup before any archive operation',async()=>{
 const backup=new VolumeBackup({root:process.cwd(),docker:async()=> 'running-container'});
 await assert.rejects(backup.assertStopped(['fixture-volume']),/Stop every/);
});
