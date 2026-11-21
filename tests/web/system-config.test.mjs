import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {CONFIG_DEFAULTS}from'../../packages/database/dist/config-contracts.js';
const state=globalThis.__configActionTest={allowed:false,calls:[]};
registerHooks({resolve(specifier,context,next){
 const mocks={
  '@/server/auth/admin-action':'export const withAdminSession=async action=>globalThis.__configActionTest.allowed?action("019a75c0-0000-7000-8000-000000000002"):{status:"denied"};',
  '@/server/database':'export const getDatabase=()=>({});',
  '@formiq/database':'export async function saveSystemConfig(...args){globalThis.__configActionTest.calls.push(args);return {status:"ok"};}export async function changeSystemConfig(...args){globalThis.__configActionTest.calls.push(args);return {status:"ok"};}export async function listSystemConfigs(){globalThis.__configActionTest.calls.push("read");return {versions:[]};}',
  '@/schemas/system-config':new URL('../../apps/web/src/schemas/system-config.ts',import.meta.url).href,
 };
 if(specifier==='@/schemas/system-config')return{url:mocks[specifier],shortCircuit:true};
 return mocks[specifier]?{url:`data:text/javascript,${encodeURIComponent(mocks[specifier])}`,shortCircuit:true}:next(specifier,context);
}});
const {refreshSettings,submitSettings,transitionSettings}=await import('../../apps/web/src/app/[locale]/admin/settings/actions.ts');
test('configuration actions authorize independently before reads or writes',async()=>{
 assert.deepEqual(await refreshSettings({page:1,limit:25,search:''}),{status:'denied'});
 assert.deepEqual(await submitSettings(CONFIG_DEFAULTS),{status:'denied'});
 assert.deepEqual(await transitionSettings({}),{status:'denied'});assert.equal(state.calls.length,0);
});
test('configuration actions validate bounded values and derive audit identity from the session',async()=>{
 state.allowed=true;
 assert.deepEqual(await submitSettings({...CONFIG_DEFAULTS,queueRetryLimit:99}),{status:'invalid'});
 assert.deepEqual(await refreshSettings({page:0,limit:25,search:''}),{status:'failed'});assert.equal(state.calls.length,0);
 assert.deepEqual(await submitSettings({...CONFIG_DEFAULTS,createdByUuid:'forged'}),{status:'ok'});
 assert.equal(state.calls[0][2],'019a75c0-0000-7000-8000-000000000002');
 assert.equal((await refreshSettings({page:1,limit:25,search:''})).status,'ok');
});
