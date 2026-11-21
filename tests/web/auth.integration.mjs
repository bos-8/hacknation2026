import { composeArgs } from '../../scripts/lib/compose.mjs';
// Explicit integration check: disposable PostgreSQL database + local signed OIDC fixture.
// No human Keycloak accounts, provider credentials or persistent application rows are modified.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync, createHash, sign, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { createDatabaseClient } from '../../packages/database/dist/index.js';
import { createAuth } from '../../apps/web/src/server/auth/auth.ts';
import { getAuthConfig } from '../../apps/web/src/server/auth/config.ts';

const infra = parseEnv(readFileSync('infra/local/.env.dev', 'utf8'));
const local = parseEnv(readFileSync('packages/database/.env', 'utf8'));
const source = new URL(local.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(source.hostname));
assert.equal(source.port || '5432', infra.DB_PORT);
assert.equal(source.pathname, '/' + infra.DB_APP_DATABASE_NAME);
const databaseName = 'poc_oidc_test_' + Date.now().toString(36);
assert.match(databaseName, /^poc_oidc_test_[a-z0-9]+$/);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const admin = sql => {
  const result = spawnSync('docker', [...composeArgs(process.cwd(), 'dev', infra), 'exec', '-T', 'db', 'sh', '-c',
    'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { input: sql, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, 'Disposable database administration failed');
};
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture', use: 'sig', alg: 'RS256' };
const subject = '11111111-2222-4333-8444-555555555555';
const profile = { sub: subject, email: 'oidc-fixture@example.invalid', email_verified: true, name: 'OIDC fixture' };
let enabled = true, issuer, codeRecord, wrongNonce = false;
let assignedRoles = [], rolesUnavailable = false;
async function handleOidc(request, response) {
  const url = new URL(request.url, issuer);
  const json = body => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(body)); };
  if (url.pathname.endsWith('/.well-known/openid-configuration')) return json({ issuer,
    authorization_endpoint: issuer + '/auth', token_endpoint: issuer + '/token', userinfo_endpoint: issuer + '/userinfo',
    jwks_uri: issuer + '/certs', response_types_supported: ['code'], subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'], code_challenge_methods_supported: ['S256'] });
  if (url.pathname.endsWith('/certs')) return json({ keys: [jwk] });
  if (url.pathname.endsWith('/auth')) {
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    codeRecord = { code: randomBytes(24).toString('hex'), nonce: url.searchParams.get('nonce'),
      challenge: url.searchParams.get('code_challenge'), redirect: url.searchParams.get('redirect_uri') };
    const callback = new URL(codeRecord.redirect);
    callback.searchParams.set('code', codeRecord.code); callback.searchParams.set('state', url.searchParams.get('state'));
    callback.searchParams.set('iss', issuer);
    response.writeHead(302, { Location: callback.href }); return response.end();
  }
  if (url.pathname.endsWith('/token')) {
    const parts = []; for await (const part of request) parts.push(part);
    const body = new URLSearchParams(Buffer.concat(parts).toString());
    if (body.get('grant_type') === 'client_credentials') {
      assert.equal(body.get('client_id'), 'directory'); assert.equal(body.get('client_secret'), 'fixture-directory-secret');
      return json({ access_token: 'fixture-directory-token', expires_in: 300 });
    }
    assert.equal(body.get('code'), codeRecord.code);
    assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), codeRecord.challenge);
    assert.equal(body.get('redirect_uri'), codeRecord.redirect);
    const now = Math.floor(Date.now() / 1000);
    const claims = { ...profile, iss: issuer, aud: 'web', iat: now, exp: now + 300, nonce: wrongNonce ? 'incorrect-nonce' : codeRecord.nonce };
    const payload = [Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify(claims)).toString('base64url')].join('.');
    codeRecord = undefined;
    return json({ access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token', token_type: 'Bearer', expires_in: 300,
      id_token: payload + '.' + sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url') });
  }
  if (url.pathname.endsWith('/userinfo')) return json(profile);
  if (url.pathname.endsWith('/role-mappings/realm/composite')) {
    assert.equal(request.headers.authorization, 'Bearer fixture-directory-token');
    if (rolesUnavailable) { response.writeHead(503); return response.end(); }
    return json(assignedRoles.map(name => ({ name })));
  }
  if (url.pathname.includes('/admin/realms/test/users')) {
    assert.equal(request.headers.authorization, 'Bearer fixture-directory-token');
    const user = { id: subject, enabled, email: profile.email, emailVerified: true, firstName: 'OIDC', lastName: 'fixture' };
    return json(url.pathname.endsWith('/users') ? [user] : user);
  }
  response.writeHead(404); response.end();
}
const oidc = createServer((request, response) => {
  handleOidc(request, response).catch(() => { response.writeHead(500); response.end(); });
});
let database, created = false;
try {
  await new Promise(resolve => oidc.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${oidc.address().port}`; issuer = origin + '/realms/test';
  admin(`CREATE DATABASE ${quote(databaseName)} OWNER ${quote(infra.DB_APP_USERNAME)} TEMPLATE template0;`); created = true;
  source.pathname = '/' + databaseName;
  const migrated = spawnSync(process.execPath, [path.resolve('packages/database/node_modules/prisma/build/index.js'),
    'migrate', 'deploy', '--config', 'prisma.config.ts'], { cwd: path.resolve('packages/database'),
    env: { ...process.env, DATABASE_URL: source.href, SHADOW_DATABASE_URL: '' }, encoding: 'utf8', windowsHide: true });
  assert.equal(migrated.status, 0, 'Prisma CLI migration failed');
  database = createDatabaseClient({ connectionString: source.href });
  const config = getAuthConfig({ AUTH_BASE_URL: 'http://127.0.0.1:31001', AUTH_SECRET: 'fixture-secret-'.repeat(4),
    AUTH_ISSUER: issuer, AUTH_CLIENT_ID: 'web', AUTH_CLIENT_SECRET: 'fixture-web-secret', AUTH_DIRECTORY_URL: origin + '/admin/realms/test',
    AUTH_DIRECTORY_CLIENT_ID: 'directory', AUTH_DIRECTORY_CLIENT_SECRET: 'fixture-directory-secret', AUTH_COOKIE_PREFIX: 'fixture_auth' });
  const auth = createAuth(config, database);
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
  async function call(route, { body, origin: requestOrigin = config.AUTH_BASE_URL, cookie = cookieHeader() } = {}) {
    const headers = new Headers({ Origin: requestOrigin, Cookie: cookie });
    if (body) headers.set('Content-Type', 'application/json');
    const response = await auth.handler(new Request(config.AUTH_BASE_URL + '/api/v1/auth' + route,
      { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';'); const offset = pair.indexOf('='); const name = pair.slice(0, offset); const value = pair.slice(offset + 1);
      if (value) jar.set(name, value); else jar.delete(name);
    }
    return response;
  }
  async function login(rejected = false) {
    const start = await call('/sign-in/social', { body: { provider: 'keycloak', callbackURL: config.AUTH_BASE_URL + '/pl',
      additionalParams: { ui_locales: 'en', formiq_theme: 'dark' },
      errorCallbackURL: config.AUTH_BASE_URL + '/pl?auth=unavailable' } });
    assert.equal(start.status, 200);
    const data = await start.json(); assert.ok(data.url, 'Authorization URL required');
    assert.equal(new URL(data.url).searchParams.get('ui_locales'), 'en');
    assert.equal(new URL(data.url).searchParams.get('formiq_theme'), 'dark');
    const authorization = await fetch(data.url, { redirect: 'manual' });
    const callback = new URL(authorization.headers.get('location'));
    const result = await call(callback.pathname.replace('/api/v1/auth', '') + callback.search);
    assert.equal(result.status, 302);
    if (rejected) { assert.ok(result.headers.get('location').includes('auth=unavailable')); return; }
    assert.equal(result.headers.get('location'), config.AUTH_BASE_URL + '/pl', 'Verified callback must succeed');
    assert.match(result.headers.get('set-cookie'), /HttpOnly/i); assert.match(result.headers.get('set-cookie'), /SameSite=Lax/i);
  }
  wrongNonce = true; await login(true); assert.equal(await database.session.count(), 0); wrongNonce = false;
  await login();
  const session = await (await call('/get-session')).json();
  assert.ok(session?.session); assert.equal(session.user.keycloakUuid, subject); assert.equal(session.user.name, 'OIDC fixture');
  const sessionUuid = session.session.id;
  const status = async () => {
    const response = await call('/session-status'); assert.equal(response.status, 200); return response.json();
  };
  assert.deepEqual((await status()).roles, []);
  assignedRoles = ['USER', 'AUDITOR', 'default-roles-test'];
  assert.deepEqual((await status()).roles, ['AUDITOR', 'USER']);
  rolesUnavailable = true; assert.equal((await status()).roles, null); rolesUnavailable = false;
  const baseline = await database.session.findUniqueOrThrow({ where: { uuid: sessionUuid } });
  await Promise.all(Array.from({ length: 5 }, () => call('/get-session')));
  await Promise.all(Array.from({ length: 5 }, () => status()));
  const checked = await database.session.findUniqueOrThrow({ where: { uuid: sessionUuid } });
  assert.equal(checked.expiresAt.getTime(), baseline.expiresAt.getTime(), 'Polling must not extend');
  assert.equal(checked.renewalCount, 0);
  assert.equal((await call('/renew-session', { body: { reason: 'manual' } })).status, 403, 'Manual renewal outside warning denied');
  assert.equal((await call('/renew-session', { body: { reason: 'navigation', pathname: '/pl/test' } })).status, 403, 'Auto mode disabled');
  assert.equal((await call('/renew-session', { body: { reason: 'manual' }, origin: 'https://attacker.example.invalid' })).status, 403);
  await database.session.update({ where: { uuid: sessionUuid }, data: { expiresAt: new Date(Date.now() + 60000) } });
  const parallel = await Promise.all(Array.from({ length: 12 }, () => call('/renew-session', { body: { reason: 'manual' } })));
  assert.ok(parallel.some(response => response.status === 200));
  assert.equal((await status()).refreshes, 1, 'Concurrent renewals share one atomic increment');
  const renewalCookie = parallel.flatMap(response => response.headers.getSetCookie()).find(value => value.startsWith('fixture_auth.session_token='));
  assert.ok(renewalCookie && /Max-Age=900/i.test(renewalCookie), 'Session cookie lifetime is 900 seconds');
  assert.ok(/HttpOnly/i.test(renewalCookie), 'Session cookie is HttpOnly');
  assert.ok(Date.parse((await status()).expiresAt) > Date.now() + 890000);
  for (let expected = 2; expected <= 3; expected++) {
    await database.session.update({ where: { uuid: sessionUuid }, data: { expiresAt: new Date(Date.now() + 60000) } });
    assert.equal((await call('/renew-session', { body: { reason: 'manual' } })).status, 200);
    assert.equal((await status()).refreshes, expected);
  }
  await database.session.update({ where: { uuid: sessionUuid }, data: { expiresAt: new Date(Date.now() + 60000) } });
  assert.equal((await call('/renew-session', { body: { reason: 'manual' } })).status, 403, 'Server renewal cap');
  await database.session.update({ where: { uuid: sessionUuid }, data: { expiresAt: new Date(Date.now() + 600000), renewalCount: 0 } });
  config.SESSION_AUTO_REFRESH = true;
  for (const pathname of ['/', '/pl', '/en', '/pl/']) {
    assert.equal((await call('/renew-session', { body: { reason: 'navigation', pathname } })).status, 403, 'Home never renews');
  }
  assert.equal((await call('/renew-session', { body: { reason: 'navigation', pathname: '/pl/test' } })).status, 200);
  assert.equal((await status()).refreshes, 1);
  assert.equal((await call('/renew-session', { body: { reason: 'navigation', pathname: '/en/test' } })).status, 200);
  assert.equal((await status()).refreshes, 1, 'Near-simultaneous navigation does not burn another renewal');
  await database.session.update({ where: { uuid: sessionUuid }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await call('/renew-session', { body: { reason: 'manual' } })).status, 401, 'Expired sessions cannot revive');
  assert.equal((await call('/session-status')).status, 401);
  config.SESSION_AUTO_REFRESH = false;
  await login();
  console.log('PASS session lifecycle: read-only checks, missing/unavailable roles, warning-only renewals, CSRF, concurrent cap, signed cookie expiry, navigation modes/home exclusion and expired-session rejection.');
  assert.match(session.user.id, /^[0-9a-f-]{14}7[0-9a-f-]+$/);
  const user = await database.user.findFirst();
  assert.deepEqual(Object.keys(user).sort(), ['uuid', 'keycloakUuid', 'systemKey', 'createdAt', 'updatedAt'].sort());
  assert.equal(user.systemKey, null, 'OIDC identities remain human identities');
  const account = await database.account.findFirst();
  assert.equal(account.subject, subject); assert.equal(account.userUuid, user.uuid);
  assert.notEqual(account.accessToken, 'fixture-access-token'); assert.notEqual(account.refreshToken, 'fixture-refresh-token');
  assert.match(account.uuid, /^[0-9a-f-]{14}7[0-9a-f-]+$/);
  await login(); assert.equal(await database.user.count(), 1); assert.equal(await database.account.count(), 1);
  const rejected = await call('/sign-out', { body: {}, origin: 'https://attacker.example.invalid' });
  assert.equal(rejected.status, 403); assert.ok((await (await call('/get-session')).json())?.session);
  enabled = false; assert.equal(await (await call('/get-session')).json(), null); enabled = true;
  await login(); const replay = cookieHeader();
  assert.equal((await call('/sign-out', { body: {} })).status, 200);
  assert.equal(await (await call('/get-session', { cookie: replay })).json(), null);
  assert.equal(await (await call('/get-session')).json(), null);
  await login();
  let hardSession = (await (await call('/get-session')).json()).session;
  const hardBody = { locale: 'en', sessionUuid: hardSession.id, reason: 'manual' };
  assert.equal((await call('/hard-sign-out', { body: hardBody, origin: 'https://attacker.example.invalid' })).status, 403);
  const changed = await (await call('/hard-sign-out', { body: { ...hardBody, sessionUuid: '00000000-0000-7000-8000-000000000099' } })).json();
  assert.equal(changed.changed, true); assert.ok((await (await call('/get-session')).json())?.session, 'Old tab preserves current identity');
  const renewed = await (await call('/hard-sign-out', { body: { ...hardBody, reason: 'expired' } })).json();
  assert.equal(renewed.renewed, true); assert.ok((await (await call('/get-session')).json())?.session, 'Old clock cannot end renewed lease');
  const oldCookie = cookieHeader();
  const hardResponse = await call('/hard-sign-out', { body: hardBody }); assert.equal(hardResponse.status, 200);
  const hardResult = await hardResponse.json();
  const logoutUrl = new URL(hardResult.url);
  assert.equal(logoutUrl.origin, new URL(issuer).origin);
  assert.equal(logoutUrl.pathname, '/realms/test/protocol/openid-connect/logout');
  assert.equal(logoutUrl.searchParams.get('post_logout_redirect_uri'), config.AUTH_BASE_URL + '/en');
  assert.equal(logoutUrl.searchParams.get('client_id'), 'web');
  const hint = logoutUrl.searchParams.get('id_token_hint');assert.equal(hint.split('.').length, 3, 'Logout receives a JWT, not ciphertext');
  assert.equal(JSON.parse(Buffer.from(hint.split('.')[1], 'base64url').toString()).sub, subject);
  assert.match(hardResponse.headers.get('set-cookie'), /Max-Age=0/i);
  assert.equal(await database.session.findUnique({ where: { uuid: hardSession.id } }), null);
  assert.equal(await (await call('/get-session', { cookie: oldCookie })).json(), null);
  const withoutCookie = await (await call('/hard-sign-out', { body: { ...hardBody, reason: 'invalid' }, cookie: '' })).json();
  assert.equal(withoutCookie.url, config.AUTH_BASE_URL + '/en');
  await login(); hardSession = (await (await call('/get-session')).json()).session;
  await database.session.update({ where: { uuid: hardSession.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const expiredHard = await call('/hard-sign-out', { body: { locale: 'pl', sessionUuid: hardSession.id, reason: 'expired' } });
  assert.equal(expiredHard.status, 200); assert.equal(await database.session.findUnique({ where: { uuid: hardSession.id } }), null);
  await login(); hardSession = (await (await call('/get-session')).json()).session;
  const logoutCookieName = [...jar.keys()].find(name => name.endsWith('.logout_context'));
  assert.ok(logoutCookieName, 'Callback creates logout-only cookie');
  assert.ok(jar.get(logoutCookieName).length < 200, 'Opaque cookie holds no provider JWT');
  const sealed = await database.verification.findMany({ where: { identifier: { startsWith: 'logout-context:' } } });
  assert.ok(sealed.length); assert.ok(sealed.every(row => !row.value.includes(profile.email) && !row.value.includes(subject)), 'Logout metadata is encrypted at rest');
  await database.session.update({ where: { uuid: hardSession.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await (await call('/get-session')).json(), null, 'Expired poll removes normal session/cookie');
  assert.equal(await database.session.findUnique({ where: { uuid: hardSession.id } }), null);
  for (const name of [...jar.keys()]) if (name.endsWith('.session_token')) jar.delete(name);
  assert.ok(jar.has(logoutCookieName), 'Logout context survives session cookie and row removal');
  const pendingLogout = await auth.api.logoutStatus({ headers: new Headers({ Cookie: cookieHeader() }) });
  assert.equal(pendingLogout.sessionUuid, hardSession.id, 'Reload can discover pending logout without authenticating');
  const capturedLogoutCookie = cookieHeader();
  const afterExpiry = await call('/hard-sign-out', { body: { locale: 'en', sessionUuid: hardSession.id, reason: 'invalid' },
    cookie: capturedLogoutCookie + '; fixture_auth.session_data.0=legacy; fixture_auth.session_token=unsigned-legacy' });
  assert.equal(afterExpiry.status, 200);
  const afterExpiryUrl = new URL((await afterExpiry.json()).url);
  assert.equal(afterExpiryUrl.pathname, '/realms/test/protocol/openid-connect/logout', 'No soft-home fallback after normal cookie expiry');
  assert.ok(afterExpiryUrl.searchParams.get('id_token_hint'));
  assert.match(afterExpiry.headers.get('set-cookie'), /fixture_auth\.session_data\.0=;/);
  assert.match(afterExpiry.headers.get('set-cookie'), /fixture_auth\.logout_context=;/);
  assert.equal((await (await call('/hard-sign-out', { body: { locale: 'en', sessionUuid: hardSession.id }, cookie: capturedLogoutCookie })).json()).url,
    config.AUTH_BASE_URL + '/en', 'Consumed logout-only context cannot replay');
  console.log('PASS expired-cookie hard logout: encrypted logout-only context, no session row/cookie, reload recovery, provider URL, auth-cookie/chunk cleanup and one-time replay rejection.');
  console.log('PASS hard logout: local revocation/cookie expiry, Keycloak JWT hint + exact locale return, CSRF, replay, expired session, missing-cookie fallback, newer identity and renewed-lease protection.');
  const context = await auth.$context;
  const systemActor = await database.user.create({ data: { systemKey: 'SYSTEM' } });
  assert.equal(await context.adapter.findOne({ model: 'user', where: [{ field: 'id', value: systemActor.uuid }] }), null, 'Technical SYSTEM actor cannot hydrate as a Better Auth identity');
  const once = await context.adapter.create({ model: 'verification', data: {
    identifier: 'atomic-fixture', value: 'single-use', expiresAt: new Date(Date.now() + 60000), createdAt: new Date(), updatedAt: new Date() } });
  const consumed = await Promise.all(Array.from({ length: 8 }, () => context.adapter.consumeOne({ model: 'verification', where: [{ field: 'id', value: once.id }] })));
  assert.equal(consumed.filter(Boolean).length, 1);
  const invalid = await call('/callback/keycloak?state=invalid&code=invalid');
  assert.equal(invalid.status, 302); assert.notEqual(invalid.headers.get('location'), config.AUTH_BASE_URL + '/pl');
  assert.ok(invalid.headers.get('location').includes('auth=unavailable'));
  console.log('PASS: signed OIDC/PKCE login + repeat login, UUIDv7/no profile persistence, encrypted tokens, live directory/disabled user, CSRF, local logout/replay and atomic state consumption.');
} finally {
  if (database) await database.$disconnect();
  await new Promise(resolve => oidc.close(resolve));
  if (created) admin(`DROP DATABASE ${quote(databaseName)} WITH (FORCE);`);
  console.log('Disposable OIDC server and test database removed.');
}
