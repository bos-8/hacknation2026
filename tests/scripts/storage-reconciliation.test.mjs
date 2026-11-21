import test from 'node:test';
import assert from 'node:assert/strict';
import {compareInventory,cleanupOrphans,reportHash} from '../../scripts/lib/storage-reconciliation.mjs';
const key='019a75c0-0000-7000-8000-000000000001';
const now=new Date('2026-11-17T12:00:00Z');
const object={key,etag:'"fixture"',modifiedAt:'2026-11-15T00:00:00.000Z',size:10};

test('report distinguishes missing objects, size mismatches and unrelated catalog files',()=>{
 const result=compareInventory([{seaweedUuid:'missing',fileUuid:key,version:1,size:8},{seaweedUuid:key,size:11}],[object],[{uuid:key}],'documents',now);
 assert.equal(result.missing.length,1);assert.equal(result.sizeMismatches.length,1);assert.equal(result.orphans.length,0);assert.equal(result.unlinkedFiles.length,1);
});

test('cleanup protects live references, changed content, young objects and unknown keys',async()=>{
 for(const scenario of ['deleted','referenced','changed','protected']){
  let removed=0,locked=false;
  const candidate=scenario==='protected'?{...object,modifiedAt:now.toISOString()}:object;
  const report=compareInventory([],[candidate],[],'documents',now);
  const transaction={$executeRaw:async()=>{locked=true;},fileVersion:{findUnique:async()=>{assert.ok(locked);return scenario==='referenced'?{uuid:key}:null;}}};
  const result=await cleanupOrphans({database:{$transaction:action=>action(transaction)},store:{head:async()=>({...object,etag:scenario==='changed'?'new':object.etag}),remove:async()=>{removed++;}},report,confirmation:reportHash(report),bucket:'documents',now});
  assert.equal(result[0].status,scenario);assert.equal(removed,scenario==='deleted'?1:0);
 }
});

test('cleanup refuses unapproved, stale and cross-bucket reports before storage/database access',async()=>{
 const report=compareInventory([],[object],[],'documents',now);
 for(const change of [{confirmation:'bad'},{bucket:'avatars'},{target:'another-environment'},{now:new Date(now.getTime()+86400001)}]){
  await assert.rejects(cleanupOrphans({report,confirmation:reportHash(report),bucket:'documents',now,...change}),/report/);
 }
});
