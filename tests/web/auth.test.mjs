import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthConfig } from '../../apps/web/src/server/auth/config.ts';
import { keycloakDirectory } from '../../apps/web/src/server/auth/directory.ts';
import { sessionView } from '../../apps/web/src/server/auth/session-view.ts';
import { renewalDecision, renewableNavigation } from '../../apps/web/src/server/auth/session-policy.ts';
import { evaluateAdminAccess } from '../../apps/web/src/server/auth/admin-policy.ts';
import { parseAdminUsersQuery } from '../../apps/web/src/schemas/admin-users.ts';

test('admin access authenticates before role reads and fails closed for missing, expired or unavailable sessions', async () => {
  let roleReads = 0;
  const readRoles = async () => { roleReads++; return ['ROOT']; };
  assert.equal(await evaluateAdminAccess({ readSession: async () => null, readRoles }), 'unauthenticated');
  assert.equal(await evaluateAdminAccess({ readSession: async () => ({ session: { expiresAt: new Date(0) }, user: { keycloakUuid: 'fixture' } }), readRoles }), 'unauthenticated');
  assert.equal(await evaluateAdminAccess({ readSession: async () => { throw new Error('offline'); }, readRoles }), 'unavailable');
  assert.equal(roleReads, 0);
});

test('admin access uses the verified Keycloak UUID and only ROOT, SADMIN or ADMIN grant access', async () => {
  const readSession = async () => ({ session: { expiresAt: new Date(Date.now() + 60000) }, user: { keycloakUuid: 'verified-fixture' } });
  for (const role of ['ROOT', 'SADMIN', 'ADMIN', 'SYSTEM', 'USER', 'GUEST', 'VIEWER', 'AUDITOR', 'ADMINISTRATOR']) {
    const access = await evaluateAdminAccess({ readSession, readRoles: async uuid => { assert.equal(uuid, 'verified-fixture'); return [role]; } });
    assert.equal(access, ['ROOT', 'SADMIN', 'ADMIN'].includes(role) ? 'allowed' : 'forbidden');
  }
  for (const roles of [[], null, undefined]) {
    assert.notEqual(await evaluateAdminAccess({ readSession, readRoles: async () => roles }), 'allowed');
  }
  assert.equal(await evaluateAdminAccess({ readSession, readRoles: async () => { throw new Error('offline'); } }), 'unavailable');
});

test('session policy validates seconds, strict booleans and warning before expiry', () => {
  assert.equal(getAuthConfig(fixture).SESSION_TTL, 2700);
  assert.equal(getAuthConfig(fixture).SESSION_AUTO_REFRESH, false);
  assert.equal(getAuthConfig({ ...fixture, SESSION_AUTO_REFRESH: 'true' }).SESSION_AUTO_REFRESH, true);
  for (const input of [{ SESSION_AUTO_REFRESH: 'yes' }, { SESSION_MAX_REFRESHES: -1 },
    { SESSION_TTL: 299 }, { SESSION_WARNING: 2700 }, { SESSION_TTL: 300, SESSION_WARNING: 301 }]) {
    assert.throws(() => getAuthConfig({ ...fixture, ...input }));
  }
});

test('renewal is warning-only manually, excludes home navigation and enforces expiry/limits', () => {
  const now = 1800000000000, policy = getAuthConfig(fixture);
  const row = { uuid: 'fixture', renewalCount: 0, expiresAt: new Date(now + 60000) };
  assert.equal(renewalDecision(row, policy, { reason: 'manual' }, now), 'renew');
  assert.equal(renewalDecision({ ...row, expiresAt: new Date(now + 600000) }, policy, { reason: 'manual' }, now), 'not-warning');
  assert.equal(renewalDecision(row, policy, { reason: 'navigation', pathname: '/pl/test' }, now), 'disabled');
  assert.equal(renewalDecision({ ...row, renewalCount: 3 }, policy, { reason: 'manual' }, now), 'limit');
  assert.equal(renewalDecision({ ...row, expiresAt: new Date(now) }, policy, { reason: 'manual' }, now), 'expired');
  for (const pathname of ['/', '/pl', '/en', '/pl/', '/en/?a=1', 'https://example.invalid/pl/test', '/pl/../test', '/pl//test']) {
    assert.equal(renewableNavigation(pathname), false, pathname);
  }
  assert.equal(renewableNavigation('/pl/test'), true);
  const enabled = getAuthConfig({ ...fixture, SESSION_AUTO_REFRESH: 'true' });
  assert.equal(renewalDecision(row, enabled, { reason: 'navigation', pathname: '/en/test' }, now), 'renew');
  assert.equal(renewalDecision({ ...row, expiresAt: new Date(now + (enabled.SESSION_TTL - 1) * 1000) }, enabled, { reason: 'navigation', pathname: '/en/test' }, now), 'unchanged');
});

const fixture = { AUTH_BASE_URL: 'https://app.example.invalid', AUTH_SECRET: 'x'.repeat(48),
  AUTH_ISSUER: 'https://identity.example.invalid/realms/test', AUTH_CLIENT_ID: 'web', AUTH_CLIENT_SECRET: 'private-fixture',
  AUTH_DIRECTORY_URL: 'https://admin.example.invalid/admin/realms/test', AUTH_DIRECTORY_CLIENT_ID: 'directory', AUTH_DIRECTORY_CLIENT_SECRET: 'private-fixture' };

test('dashboard identity counts use matching human-user filters for total and enabled accounts', async t => {
  const counts = [];
  t.mock.method(globalThis, 'fetch', async value => {
    const url = new URL(value);
    if (url.pathname.endsWith('/token')) return Response.json({ access_token: 'fixture-token', expires_in: 300 });
    assert.ok(url.pathname.endsWith('/users/count'));
    assert.equal(url.searchParams.get('search'), '*');
    counts.push(url.searchParams.get('enabled'));
    return Response.json(url.searchParams.get('enabled') === 'true' ? 6 : 10);
  });
  assert.deepEqual(await keycloakDirectory(fixture).userCounts(), { total: 10, enabled: 6 });
  assert.deepEqual(counts.sort(), [null, 'true'].sort());
});

test('auth config restricts origins/realm URLs and never prints invalid secret values', () => {
  assert.equal(getAuthConfig(fixture).AUTH_BASE_URL, fixture.AUTH_BASE_URL);
  for (const override of [{ AUTH_BASE_URL: 'http://app.example.invalid' }, { AUTH_BASE_URL: 'https://app.example.invalid/path' },
    { AUTH_ISSUER: 'https://identity.example.invalid/realms/test?secret=private-fixture' },
    { AUTH_DIRECTORY_URL: 'https://admin.example.invalid/admin/realms/other' }, { AUTH_SECRET: 'private-fixture' }]) {
    assert.throws(() => getAuthConfig({ ...fixture, ...override }), error => {
      assert.doesNotMatch(error.message, /private-fixture/); return true;
    });
  }
});

test('malformed auth URLs produce field-only errors without retaining the invalid input', () => {
  for (const field of ['AUTH_BASE_URL', 'AUTH_ISSUER', 'AUTH_DIRECTORY_URL']) {
    for (const value of ['malformed-private-fixture', 'https://[private-fixture']) {
      assert.throws(() => getAuthConfig({ ...fixture, [field]: value }), error => {
        assert.equal(error.message, `Invalid auth configuration: ${field}`);
        assert.equal(Object.hasOwn(error, 'input'), false);
        assert.equal(error.cause, undefined);
        return true;
      });
    }
  }
});

test('auth secret rejects whitespace without transforming valid secret bytes', () => {
  for (const value of [' '.repeat(40), '\n\t'.repeat(20)]) {
    assert.throws(() => getAuthConfig({ ...fixture, AUTH_SECRET: value }), /Invalid auth configuration: AUTH_SECRET/);
  }
  const secret = ` ${'x'.repeat(40)} `;
  assert.equal(getAuthConfig({ ...fixture, AUTH_SECRET: secret }).AUTH_SECRET, secret);
});

test('invalid provider identifiers are rejected before accessing the directory', async () => {
  const directory = keycloakDirectory(getAuthConfig(fixture));
  assert.equal(await directory.byUuid('../master/users'), null);
  assert.equal(await directory.byEmail('not-an-email'), null);
});

test('directory preserves optional profile names, trims whitespace and keeps email fallback', async (t) => {
  const uuid = '11111111-2222-4333-8444-555555555555';
  let user = { id: uuid, enabled: true, email: 'person@example.invalid', firstName: '  Anna ', lastName: ' Kowalska  ' };
  t.mock.method(globalThis, 'fetch', async url => Response.json(String(url).endsWith('/token')
    ? { access_token: 'fixture-token', expires_in: 300 } : user));
  const directory = keycloakDirectory(getAuthConfig(fixture));
  const named = await directory.byUuid(uuid);
  assert.equal(named.firstName, 'Anna');
  assert.equal(named.lastName, 'Kowalska');
  assert.equal(named.name, 'Anna Kowalska');
  user = { ...user, firstName: ' ', lastName: '' };
  const unnamed = await directory.byUuid(uuid);
  assert.equal(unnamed.firstName, undefined);
  assert.equal(unnamed.lastName, undefined);
  assert.equal(unnamed.name, user.email);
});

test('user listing paginates and searches on Keycloak, includes disabled/email-less accounts and strips private fields', async (t) => {
  const requests = [];
  let tokenRequests = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const target = new URL(url);
    if (target.pathname.endsWith('/token')) {
      tokenRequests++;
      return Response.json({ access_token: 'fixture-token', expires_in: 300 });
    }
    requests.push(target);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    if (target.pathname.endsWith('/count')) return Response.json(26);
    return Response.json([{ id: '11111111-2222-4333-8444-555555555555', username: 'disabled-service', enabled: false,
      credentials: [{ value: 'private-password' }], attributes: { private: ['fixture'] } }]);
  });
  const result = await keycloakDirectory(getAuthConfig(fixture)).listUsers({ page: 2, search: '  Anna & Jan  ', limit: 10, enabled: false, emailVerified: false });
  assert.equal(tokenRequests, 1);
  assert.equal(requests.length, 2);
  for (const url of requests) {
    assert.equal(url.searchParams.get('search'), 'Anna & Jan');
    assert.equal(url.searchParams.get('enabled'), 'false');
    assert.equal(url.searchParams.get('emailVerified'), 'false');
  }
  const list = requests.find(url => !url.pathname.endsWith('/count'));
  assert.equal(list.searchParams.get('first'), '10');
  assert.equal(list.searchParams.get('max'), '10');
  assert.equal(list.searchParams.get('briefRepresentation'), 'true');
  assert.equal(result.total, 26);
  assert.equal(result.users[0].enabled, false);
  assert.equal(result.users[0].email, undefined);
  assert.doesNotMatch(JSON.stringify(result), /private|credentials|attributes/);
});

test('user listing distinguishes provider errors and malformed results from an empty list', async (t) => {
  let body = [], count = 0, status = 200;
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).endsWith('/token')) return Response.json({ access_token: 'fixture-token', expires_in: 300 });
    return Response.json(String(url).includes('/count?') ? count : body, { status });
  });
  const directory = keycloakDirectory(getAuthConfig(fixture));
  assert.deepEqual(await directory.listUsers({ page: 1, search: '' }), { users: [], total: 0 });
  for (const invalid of [null, {}, [{ id: '../realm', username: 'bad', enabled: true }]]) {
    body = invalid;
    await assert.rejects(directory.listUsers({ page: 1, search: '' }));
  }
  body = []; count = '10';
  await assert.rejects(directory.listUsers({ page: 1, search: '' }));
  count = 0; status = 403;
  await assert.rejects(directory.listUsers({ page: 1, search: '' }), /Identity directory unavailable/);
});

test('user list bounds reject unsafe offsets before network access and normalize repeated or oversized query parameters', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network request'); });
  const directory = keycloakDirectory(getAuthConfig(fixture));
  for (const page of [-1, 0, 1.5, Infinity, 40002]) await assert.rejects(directory.listUsers({ page, search: '' }));
  await assert.rejects(directory.listUsers({ page: 1, search: 'a'.repeat(201) }));
  assert.deepEqual(parseAdminUsersQuery({ page: '2', search: '  Anna  ', limit: '50' }), { page: 2, search: 'Anna', limit: 50 });
  assert.equal(parseAdminUsersQuery({ limit: '1000' }).limit, 25);
  assert.equal(parseAdminUsersQuery({ limit: ['10', '50'] }).limit, 25);
  for (const page of ['-1', '1e3', 'Infinity', '40002', ['2', '3']]) {
    assert.equal(parseAdminUsersQuery({ page }).page, 1);
  }
  assert.equal(parseAdminUsersQuery({ search: ['a', 'b'] }).search, '');
  assert.equal(parseAdminUsersQuery({ search: 'a'.repeat(201) }).search, '');
});

test('public session DTO uses UUID names and excludes session/provider tokens', () => {
  const expiresAt = new Date('2030-01-01T00:00:00Z');
  const input = { user: { id: 'local-user-uuid', name: 'Display name', email: 'private@example.invalid' },
    session: { id: 'local-session-uuid', expiresAt, token: 'private-session-token', userId: 'local-user-uuid' },
    account: { accessToken: 'private-provider-token' } };
  assert.deepEqual(sessionView(input), { user: { uuid: 'local-user-uuid', name: 'Display name' },
    session: { uuid: 'local-session-uuid', expiresAt } });
  assert.doesNotMatch(JSON.stringify(sessionView(input)), /private/);
  assert.equal(sessionView(null), null);
});
