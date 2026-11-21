import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const state=globalThis.__sessionBoundary={};
registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.includes('/server/auth/access.ts')){
  const accessMocks={
   'next/server':'export const connection=()=>globalThis.__sessionBoundary.connected;',
   'next/navigation':'export const forbidden=()=>{};export const unauthorized=()=>{};',
   './session.ts':'export const getSession=async()=>{globalThis.__sessionBoundary.calls.push("access-session");return null;};',
   './directory.ts':'export const getIdentityDirectory=()=>({rolesByUuid:async()=>[]});',
  };
  if(accessMocks[specifier])return {url:`data:text/javascript,${encodeURIComponent(accessMocks[specifier])}`,shortCircuit:true};
 }
 const mocks={
  'next/server':'export const connection=()=>globalThis.__sessionBoundary.connected;',
  'next/headers':'export const headers=async()=>({request:"fixture"});',
  './auth.ts':'export const getAuth=()=>({api:{getSession:async input=>{globalThis.__sessionBoundary.calls.push(input);return {user:{id:"fixture"}};}}});',
 };
 return context.parentURL?.includes('/server/auth/session.ts')&&mocks[specifier]
  ? {url:`data:text/javascript,${encodeURIComponent(mocks[specifier])}`,shortCircuit:true}:next(specifier,context);
}});

test('session signature verification waits for a real request before accessing auth',async()=>{
 let connect;state.calls=[];state.connected=new Promise(resolve=>{connect=resolve;});
 const {getSession}=await import('../../apps/web/src/server/auth/session.ts?case=connected');
 const pending=getSession();await Promise.resolve();assert.deepEqual(state.calls,[]);
 connect();assert.deepEqual(await pending,{user:{id:'fixture'}});
 assert.deepEqual(state.calls,[{headers:{request:'fixture'}}]);
});

test('an aborted speculative request never invokes session verification',async()=>{
 state.calls=[];state.connected=Promise.reject(new Error('Request cancelled'));
 const {getSession}=await import('../../apps/web/src/server/auth/session.ts?case=cancelled');
 await assert.rejects(getSession(),/Request cancelled/);assert.deepEqual(state.calls,[]);
});

test('access checks propagate prerender interruption instead of reporting an auth outage',async()=>{
 state.calls=[];state.connected=Promise.reject(new Error('Prerender interrupted'));
 const {getAccess}=await import('../../apps/web/src/server/auth/access.ts?case=prerender');
 await assert.rejects(getAccess({requireLogin:true}),/Prerender interrupted/);
 assert.deepEqual(state.calls,[]);
});
