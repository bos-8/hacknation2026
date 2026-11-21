import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const state = globalThis.__logoutRace = {};
registerHooks({ resolve(specifier, context, next) {
  if (!context.parentURL?.endsWith('/auth/logout-plugin.ts')) return next(specifier, context);
  const mocks = {
    'better-auth/api': 'export class APIError extends Error{}; export const createAuthEndpoint=(_path,_options,handler)=>handler; export const createAuthMiddleware=handler=>handler;',
    'better-auth/oauth2': 'export const decryptOAuthToken=async value=>value;',
    './logout-context.ts': 'export const readLogoutContext=async()=>globalThis.__logoutRace.saved??null; export const ensureLogoutContext=async()=>{}; export const clearAuthCookies=()=>{globalThis.__logoutRace.cleared++;};',
  };
  return mocks[specifier] ? { url: 'data:text/javascript,' + encodeURIComponent(mocks[specifier]), shortCircuit: true } : next(specifier, context);
} });
const { hardLogoutPlugin } = await import('../../apps/web/src/server/auth/logout-plugin.ts');

test('expiry logout cannot revoke a session renewed after its expiry check', async () => {
  const uuid='019a75c0-0000-7000-8000-000000000001';
  let current = { uuid, userUuid: uuid, token: 'private-fixture', expiresAt: new Date(Date.now()-1000), renewalCount: 0 };
  state.cleared=0;
  const database = {
    session: {
      findUnique: async () => ({...current}),
      deleteMany: async ({where}) => {
        assert.equal(where.renewalCount,0);
        assert.ok(where.expiresAt.getTime()<Date.now());
        return {count: where.renewalCount===current.renewalCount && where.expiresAt.getTime()===current.expiresAt.getTime() ? 1 : 0};
      },
    },
    account: { findFirst: async () => {
      // Renewal wins between the checked read and conditional revocation.
      current={...current,expiresAt:new Date(Date.now()+60000),renewalCount:1};return null;
    } },
  };
  const config={AUTH_BASE_URL:'https://modulon.local'};
  const handler=hardLogoutPlugin(config,database,async()=>true).endpoints.hardSignOut;
  const result=await handler({headers:new Headers({origin:config.AUTH_BASE_URL}),body:{locale:'en',reason:'expired'},
    context:{authCookies:{sessionToken:{name:'fixture'}},secret:'fixture'},getSignedCookie:async()=>current.token,json:value=>value});
  assert.deepEqual(result,{success:true,renewed:true});
  assert.equal(state.cleared,0);
  assert.equal(current.renewalCount,1);
});

test('a delayed invalid-session logout after 401 preserves a lease renewed before its checked read',async()=>{
 const uuid='019a75c0-0000-7000-8000-000000000001';state.cleared=0;
 const oldExpiry=new Date(Date.now()-1000).toISOString();
 const row={uuid,userUuid:uuid,token:'fixture',expiresAt:new Date(Date.now()+60000),renewalCount:1};
 const database={session:{findUnique:async()=>row,deleteMany:async()=>{throw Error('New lease must not be deleted');}}};
 const config={AUTH_BASE_URL:'https://modulon.local'};
 const result=await hardLogoutPlugin(config,database,async()=>true).endpoints.hardSignOut({headers:new Headers({origin:config.AUTH_BASE_URL}),body:{locale:'en',reason:'invalid',expectedExpiresAt:oldExpiry,expectedRenewalCount:0},context:{authCookies:{sessionToken:{name:'fixture'}},secret:'fixture'},getSignedCookie:async()=>row.token,json:value=>value});
 assert.deepEqual(result,{success:true,renewed:true});assert.equal(state.cleared,0);
});

test('invalid provider identity without a newer lease still revokes the checked session',async()=>{
 const uuid='019a75c0-0000-7000-8000-000000000001';state.cleared=0;let deleted=false;
 const row={uuid,userUuid:uuid,token:'fixture',expiresAt:new Date(Date.now()+60000),renewalCount:1};
 const database={session:{findUnique:async()=>row,deleteMany:async({where})=>{assert.equal(where.expiresAt,row.expiresAt);assert.equal(where.renewalCount,1);deleted=true;return{count:1};}},account:{findFirst:async()=>null}};
 const config={AUTH_BASE_URL:'https://modulon.local'};
 const result=await hardLogoutPlugin(config,database,async()=>true).endpoints.hardSignOut({headers:new Headers({origin:config.AUTH_BASE_URL}),body:{locale:'en',reason:'invalid',expectedExpiresAt:row.expiresAt.toISOString(),expectedRenewalCount:1},context:{authCookies:{sessionToken:{name:'fixture'}},secret:'fixture'},getSignedCookie:async()=>row.token,json:value=>value,setHeader:()=>{}});
 assert.deepEqual(result,{success:true,url:config.AUTH_BASE_URL+'/en'});assert.ok(deleted);assert.equal(state.cleared,1);
});

test('a disabled identity cannot keep a renewed lease alive through repeated invalid-session responses',async()=>{
 const uuid='019a75c0-0000-7000-8000-000000000001';state.cleared=0;let deleted=false;
 const row={uuid,userUuid:uuid,token:'fixture',expiresAt:new Date(Date.now()+60000),renewalCount:1};
 const database={session:{findUnique:async()=>row,deleteMany:async({where})=>{assert.deepEqual(where,{uuid,userUuid:uuid});deleted=true;return{count:1};}},account:{findFirst:async()=>null}};
 const config={AUTH_BASE_URL:'https://modulon.local'};
 const result=await hardLogoutPlugin(config,database,async()=>false).endpoints.hardSignOut({headers:new Headers({origin:config.AUTH_BASE_URL}),body:{locale:'en',reason:'invalid',expectedExpiresAt:new Date(0).toISOString(),expectedRenewalCount:0},context:{authCookies:{sessionToken:{name:'fixture'}},secret:'fixture'},getSignedCookie:async()=>row.token,json:value=>value,setHeader:()=>{}});
 assert.deepEqual(result,{success:true,url:config.AUTH_BASE_URL+'/en'});assert.ok(deleted);assert.equal(state.cleared,1);
});

test('a valid lease with a lost main cookie does not restart provider logout on the public page',async t=>{
 const uuid='019a75c0-0000-7000-8000-000000000001';state.cleared=0;
 state.saved={data:{sessionUuid:uuid,userUuid:uuid,sessionExpiresAt:new Date(Date.now()+60000).toISOString()}};
 t.after(()=>{delete state.saved;});
 let row={uuid,userUuid:uuid,expiresAt:new Date(Date.now()+60000)};
 const database={session:{findUnique:async()=>row}};
 const plugin=hardLogoutPlugin({},database,async()=>true);
 assert.equal(await plugin.endpoints.logoutStatus({json:value=>value}),null);
 row={...row,expiresAt:new Date(0)};
 assert.equal((await plugin.endpoints.logoutStatus({json:value=>value})).sessionUuid,uuid);
 assert.equal(state.cleared,0);
});
