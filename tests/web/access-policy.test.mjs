import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLE_LEVELS, ADMIN_ACCESS, roleLevel } from '../../apps/web/src/schemas/access.ts';
import { evaluateAccess } from '../../apps/web/src/server/auth/access-policy.ts';

const session = { user: { id: 'local-actor', keycloakUuid: 'verified-provider-sub' }, session: { expiresAt: new Date(Date.now() + 60000) } };
const boundary = roles => ({ readSession: async () => session, readRoles: async uuid => { assert.equal(uuid, session.user.keycloakUuid); return roles; } });

test('application role levels match the managed Keycloak attributes exactly', () => {
  assert.deepEqual(ROLE_LEVELS, {ROOT:100,SADMIN:90,ADMIN:80,USER:50,LOGED:0});
  const roles=JSON.parse(readFileSync('infra/local/keycloak/realms/formiq-realm.json','utf8')).roles.realm;
  for(const [name,level] of Object.entries(ROLE_LEVELS)) assert.deepEqual(roles.find(role=>role.name===name).attributes.level,[String(level)]);
  assert.equal(roleLevel(['VIEWER','AUDITOR','SYSTEM','GUEST','1000','__proto__']),0);
});

test('inclusive role thresholds admit exactly equal or greater verified levels', async () => {
  for(const [role,level] of Object.entries(ROLE_LEVELS)) for(const threshold of [0,50,80,90,100]) {
    const result=await evaluateAccess({requireLogin:true,minRoleLevel:threshold},boundary([role]));
    assert.equal(result.status,level>=threshold?'allowed':'forbidden',`${role} >= ${threshold}`);
    if(result.status==='allowed')assert.equal(result.context.actorUuid,'local-actor');
  }
  assert.equal((await evaluateAccess(ADMIN_ACCESS,boundary(['USER','SADMIN']))).status,'allowed');
});

test('anonymous, expired and invalid sessions never qualify as LOGED level zero', async () => {
  for(const invalid of [null,{...session,session:{expiresAt:new Date(0)}},{...session,session:{expiresAt:new Date('invalid')}}]) {
    let rolesRead=false;
    assert.equal((await evaluateAccess({minRoleLevel:0},{readSession:async()=>invalid,readRoles:async()=>{rolesRead=true;return ['ROOT'];}})).status,'unauthenticated');
    assert.equal(rolesRead,false);
  }
  assert.equal((await evaluateAccess({requireLogin:false},{readSession:async()=>null,readRoles:async()=>[]})).status,'allowed');
});

test('role backend failures fail closed above login level and invalid policies grant nothing', async () => {
  for(const roles of [null,undefined]) {
    assert.equal((await evaluateAccess(ADMIN_ACCESS,boundary(roles))).status,'unavailable');
    assert.equal((await evaluateAccess({minRoleLevel:0},boundary(roles))).status,'allowed');
  }
  const failed={readSession:async()=>session,readRoles:async()=>{throw new Error('directory unavailable');}};
  assert.equal((await evaluateAccess(ADMIN_ACCESS,failed)).status,'unavailable');
  assert.equal((await evaluateAccess({minRoleLevel:0},failed)).status,'allowed');
  for(const minRoleLevel of [-1,101,NaN,'80'])assert.equal((await evaluateAccess({minRoleLevel},boundary(['ROOT']))).status,'forbidden');
});
