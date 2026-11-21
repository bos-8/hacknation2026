import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { devSeedUsers, seedDevUsers } from '../../scripts/dev-seed-users.mjs';

const env = { ENV_MODE: 'dev', STACK_NAME: 'formiqdev', AUTH_ADMIN_PUBLIC_URL: 'https://localhost:8443',
  AUTH_ADMIN_USERNAME: 'operator', AUTH_ADMIN_PASSWORD: 'fixture-operator' };

test('local DEV has demo passwords with per-account overrides', () => {
  const users = devSeedUsers(env);
  assert.deepEqual(users.map(user => [user.username, user.credentials[0].value, user.realmRoles]),
    [['admin', 'admin', ['ROOT']], ['user', 'user', ['USER']]]);
  assert.ok(users.every(user => user.enabled && user.emailVerified && !user.credentials[0].temporary));
  const custom = devSeedUsers({ ...env, DEV_SEED_ADMIN_PASSWORD: 'custom-admin', DEV_SEED_USER_PASSWORD: 'custom-user' });
  assert.deepEqual(custom.map(user => user.credentials[0].value), ['custom-admin', 'custom-user']);
});

test('seeding rejects QA, other stacks and nonlocal endpoints before any request', async () => {
  for (const override of [{ ENV_MODE: 'qa' }, { STACK_NAME: 'formiqqa' },
    { AUTH_ADMIN_PUBLIC_URL: 'https://auth.example.invalid' }]) {
    await assert.rejects(seedDevUsers({ ...env, ...override }, () => assert.fail('Unexpected request')), /local formiqdev/);
  }
});

function fixture({ roles = { admin: ['ROOT', 'ADMIN', 'USER'], user: ['USER'] }, conflict = false } = {}) {
  const accounts = new Map();
  const passwords = new Map();
  const calls = [];
  return { passwords, calls, request: async (route, options = {}) => {
    calls.push({ route, method: options.method ?? 'GET' });
    if (route.startsWith('/realms/master/')) return { access_token: 'fixture-token' };
    assert.equal(options.headers.authorization, 'Bearer fixture-token');
    if (route.endsWith('/partialImport')) {
      const payload = JSON.parse(options.body);
      assert.equal(payload.ifResourceExists, 'SKIP');
      let added = 0;
      for (const user of payload.users) if (!accounts.has(user.username)) {
        accounts.set(user.username, { ...user, id: user.username });
        passwords.set(user.username, user.credentials[0].value);
        added++;
      }
      return { added, skipped: payload.users.length - added };
    }
    if (route.includes('/users?')) {
      const username = new URLSearchParams(route.split('?')[1]).get('username');
      return [{ ...accounts.get(username), ...(conflict ? { email: 'other@example.invalid' } : {}) }];
    }
    const username = route.split('/users/')[1].split('/')[0];
    return roles[username].map(name => ({ name }));
  } };
}

test('missing identities are created; subsequent starts preserve existing passwords', async () => {
  const { request, passwords, calls } = fixture();
  assert.deepEqual(await seedDevUsers(env, request), { added: 2, skipped: 0 });
  assert.deepEqual(await seedDevUsers({ ...env, DEV_SEED_ADMIN_PASSWORD: 'changed' }, request), { added: 0, skipped: 2 });
  assert.equal(passwords.get('admin'), 'admin');
  assert.ok(calls.every(call => call.method === 'GET' || call.route.endsWith('/token') || call.route.endsWith('/partialImport')));
});

test('unexpected identity or privilege assignments fail verification', async () => {
  for (const options of [{ conflict: true }, { roles: { admin: ['USER'], user: ['USER'] } },
    { roles: { admin: ['ROOT'], user: ['USER', 'ADMIN'] } }]) {
    await assert.rejects(seedDevUsers(env, fixture(options).request), /conflict|Unexpected application roles/);
  }
});

test('DEV prepares Keycloak users after database seeds and QA does not invoke the DEV seed', async () => {
  const { scripts } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.match(scripts['dev:prepare:application'], /pnpm dev:seed && pnpm dev:seed:users$/);
  for (const [name, command] of Object.entries(scripts)) if (name.startsWith('qa:')) {
    assert.doesNotMatch(command, /dev:seed:users/);
  }
});
