import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const state=globalThis.__monitoringTest={allowed:false,reads:0,fail:false};
registerHooks({resolve(specifier,context,next){
 const mocks={
  '@/server/auth/admin-action':'export const withAdminSession=async action=>globalThis.__monitoringTest.allowed?action():{status:"denied"};',
  '@/server/database':'export const getDatabase=()=>({});',
  '@formiq/monitoring':'export async function readHealth(db,now,hours){const s=globalThis.__monitoringTest;s.reads++;if(s.fail)throw new Error("private connection");return {services:[],hours};}',
 };
 return mocks[specifier]?{url:`data:text/javascript,${encodeURIComponent(mocks[specifier])}`,shortCircuit:true}:next(specifier,context);
}});
const {refreshMonitoring}=await import('../../apps/web/src/app/[locale]/admin/monitoring-actions.ts');
test('health history requires administrator access and never exposes internal failures',async()=>{
 assert.deepEqual(await refreshMonitoring(),{status:'denied'});assert.equal(state.reads,0);
 state.allowed=true;assert.deepEqual(await refreshMonitoring(),{status:'ok',overview:{services:[],hours:8}});
 const before=state.reads;
 for(const invalid of [0,9,169,'8',null,{},Infinity])assert.deepEqual(await refreshMonitoring(invalid),{status:'failed'});
 assert.equal(state.reads,before);
 for(const hours of [8,24,72,168])assert.equal((await refreshMonitoring(hours)).overview.hours,hours);
 state.fail=true;assert.deepEqual(await refreshMonitoring(),{status:'failed'});
});
