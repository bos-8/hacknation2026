import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const state=globalThis.__historyTest={access:'allowed',reads:0};
registerHooks({resolve(specifier,context,next){
 if(!context.parentURL?.endsWith('/admin/history/route.ts'))return next(specifier,context);
 const sources={
  '@/server/auth/access':'export const getAccess=async()=>({status:globalThis.__historyTest.access});',
  '@/schemas/access':'export const ADMIN_ACCESS={};',
  '@/server/database':'export const getDatabase=()=>({changeHistory:{findMany:async args=>{const state=globalThis.__historyTest;state.reads++;state.args=args;return state.rows;}}});',
 };
 return sources[specifier]?{url:'data:text/javascript,'+encodeURIComponent(sources[specifier]),shortCircuit:true}:next(specifier,context);
}});
const {GET}=await import('../../apps/web/src/app/api/v1/admin/history/route.ts');
const uuid='019a75c0-0000-7000-8000-000000000001';

test('history authenticates before reading private snapshots and validates entity/UUID',async()=>{
 for(const [status,code] of [['unauthenticated',401],['forbidden',403],['unavailable',503]]){
  state.access=status;assert.equal((await GET(new Request(`https://modulon.local/api/v1/admin/history?entity=product&uuid=${uuid}`))).status,code);
 }
 assert.equal(state.reads,0);state.access='allowed';
 assert.equal((await GET(new Request('https://modulon.local/api/v1/admin/history?entity=session&uuid='+uuid))).status,400);
 assert.equal(state.reads,0);
});

test('history returns bounded entity-scoped snapshots without public caching',async()=>{
 state.access='allowed';state.rows=[{uuid,actorUuid:uuid,operation:'UPDATE',before:{price:'1.0000'},after:{price:'2.0000'}}];
 const response=await GET(new Request(`https://modulon.local/api/v1/admin/history?entity=product&uuid=${uuid}`));
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);
 assert.deepEqual(state.args.where,{entity:'product',entityUuid:uuid});assert.equal(state.args.take,100);
 assert.deepEqual((await response.json()).rows,state.rows);
});
