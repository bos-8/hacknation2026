import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { synchronizeRealmRoles } from '../../infra/local/keycloak/realm-roles.mjs';

const desired = JSON.parse(await readFile(new URL('../../infra/local/keycloak/realms/formiq-realm.json', import.meta.url))).roles.realm;

function fixture() {
  const roles = new Map(desired.map((role, index) => [role.name, { id: `role-${index}`, name: role.name }]));
  const legacy = roles.get('ADMIN');
  roles.delete('ADMIN'); legacy.name = 'ADMINISTRATOR'; roles.set(legacy.name, legacy);
  const edges = new Map([...roles.values()].map(role => [role.id, []]));
  edges.set(roles.get('VIEWER').id, [roles.get('ROOT')]); // Accidental escalation must be removed.
  const userAssignment = legacy.id, groupAssignment = legacy.id;
  const api = async (method, path, body, missing = false) => {
    const match = path.match(/^\/realms\/modulon\/roles(?:\/([^/]+))?(\/composites)?$/);
    assert.ok(match, 'only realm role endpoints are accessed');
    const name = decodeURIComponent(match[1] ?? ''), role = roles.get(name);
    if (method === 'POST' && !match[1]) { roles.set(body.name, { ...body, id: 'created-' + body.name }); edges.set(roles.get(body.name).id, []); return; }
    if (!role) { if (missing) return null; throw new Error('Role missing'); }
    if (match[2]) {
      if (method === 'GET') return edges.get(role.id);
      if (method === 'POST') edges.set(role.id, [...edges.get(role.id), ...body]);
      else if (method === 'DELETE') edges.set(role.id, edges.get(role.id).filter(child => !body.some(removed => removed.id === child.id)));
      else throw new Error('Unexpected composite method');
    } else if (method === 'GET') return { ...role };
    else if (method === 'PUT') { roles.delete(name); Object.assign(role, body); roles.set(role.name, role); }
    else throw new Error('Unexpected role method');
  };
  return { roles, edges, api, userAssignment, groupAssignment };
}

test('realm synchronization preserves renamed role identity, reconciles hierarchy and keeps independent roles separate', async () => {
  const state = fixture();
  await synchronizeRealmRoles(state.api, '/realms/modulon', desired);
  assert.equal(state.roles.has('ADMINISTRATOR'), false);
  assert.equal(state.roles.get('ADMIN').id, state.userAssignment);
  assert.equal(state.roles.get('ADMIN').id, state.groupAssignment);
  for (const [name, children] of Object.entries({ ROOT: ['SADMIN'], SADMIN: ['ADMIN'], ADMIN: ['USER'], USER: ['LOGED'], LOGED: [], VIEWER: [], AUDITOR: [], SYSTEM: [], GUEST: [] })) {
    assert.deepEqual(state.edges.get(state.roles.get(name).id).map(role => role.name), children, name);
  }
  const snapshot = JSON.stringify([...state.edges]);
  await synchronizeRealmRoles(state.api, '/realms/modulon', desired);
  assert.equal(JSON.stringify([...state.edges]), snapshot, 'repeat synchronization is idempotent');
});

test('duplicate old/new admin roles stop synchronization rather than lose assignments', async () => {
  const state = fixture();
  state.roles.set('ADMIN', { id: 'conflicting-admin', name: 'ADMIN' });
  await assert.rejects(synchronizeRealmRoles(state.api, '/realms/modulon', desired), /Both ADMINISTRATOR and ADMIN/);
  assert.equal(state.roles.get('ADMINISTRATOR').id, state.userAssignment);
});
