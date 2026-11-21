import { readFile } from 'node:fs/promises';
import { synchronizeRealmRoles } from './realm-roles.mjs';

const env = process.env;
const base = 'http://127.0.0.1:8080';
const encode = encodeURIComponent;
const resolve = value => {
  if (typeof value === 'string') return value.replace(/\$\{([A-Z0-9_]+)(?::([^}]*))?\}/g, (_, name, fallback) => {
    const result = env[name] ?? fallback;
    if (result === undefined || result === '') throw new Error(`Missing ${name}`);
    return result;
  });
  if (Array.isArray(value)) return value.map(resolve);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]));
  return value;
};

async function main() {
  for (const name of ['AUTH_ADMIN_USERNAME', 'AUTH_ADMIN_PASSWORD', 'KEYCLOAK_WEB_CLIENT_SECRET', 'AUTH_DIRECTORY_CLIENT_SECRET']) {
    if (!env[name]) throw new Error(`Missing ${name}`);
  }
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch('http://127.0.0.1:9000/health/ready', { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; }
    } catch { /* Keycloak is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error('Keycloak did not become ready for realm bootstrap');
  const realm = resolve(JSON.parse(await readFile('/opt/keycloak/data/import/formiq-realm.json', 'utf8')));
  for (const key of ['ssoSessionIdleTimeout', 'ssoSessionMaxLifespan', 'clientSessionIdleTimeout', 'clientSessionMaxLifespan']) {
    realm[key] = Number(realm[key]);
    if (!Number.isInteger(realm[key]) || realm[key] < 60) throw new Error(`Invalid ${key}`);
  }
  if (realm.ssoSessionMaxLifespan < realm.ssoSessionIdleTimeout) throw new Error('Maximum session duration must cover idle duration');
  const login = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli',
      username: env.AUTH_ADMIN_USERNAME, password: env.AUTH_ADMIN_PASSWORD }),
  });
  if (!login.ok) throw new Error(`Keycloak operator authentication failed (HTTP ${login.status}), existing passwords are not rotated`);
  const token = (await login.json()).access_token;
  async function api(method, route, body, allowMissing = false) {
    const response = await fetch(`${base}/admin${route}`, {
      method, signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`Keycloak ${method} ${route} failed (HTTP ${response.status}), response contents hidden`);
    return response.status === 204 || response.status === 201 ? null : response.json();
  }
  const route = `/realms/${encode(realm.realm)}`;
  const realms = await api('GET', '/realms');
  const target = realms.find(item => item.realm === realm.realm);
  const previous = realms.find(item => item.realm === 'formiq');
  if (previous && target) throw new Error('Both formiq and FORMIQ exist. Resolve realm ownership before starting.');
  if (previous) await api('PUT', '/realms/formiq', { realm: realm.realm });
  else if (!target) await api('POST', '/realms', realm);
  // Never replace users, credentials, clients or role assignments through a full realm import.
  const settings = Object.fromEntries(Object.entries(realm).filter(([key]) =>
    !['clients', 'roles', 'users', 'clientScopeMappings'].includes(key)));
  await api('PUT', route, settings);
  // Merge the profile policy without replacing custom attributes or user data.
  const profile = await api('GET', `${route}/users/profile`);
  for (const name of ['email', 'firstName', 'lastName']) {
    const attribute = profile.attributes.find(attribute => attribute.name === name);
    if (!attribute) throw new Error(`Missing managed user profile attribute: ${name}`);
    if (name === 'email') attribute.required = { roles: ['user', 'admin'] };
    else delete attribute.required;
  }
  const avatarOrigin = new URL(env.APP_PUBLIC_URL).origin;
  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const managedAttributes = [
    { name: 'middleName', displayName: '${modMiddleName}', validations: { length: { max: 255 }, 'person-name-prohibited-characters': {} } },
    { name: 'phoneNumber', displayName: '${modPhone}', validations: { pattern: { pattern: '^\\+[1-9][0-9]{6,14}$', 'error-message': 'modPhoneFormat' } }, annotations: { inputType: 'html5-tel', inputHelperTextAfter: '${modPhoneHint}' } },
    { name: 'locale', displayName: '${modLocale}', validations: { options: { options: ['pl', 'en'] } }, annotations: { inputType: 'select' } },
    { name: 'picture', displayName: '${modPicture}', validations: { length: { max: 512 }, pattern: { pattern: `^${escapeRegex(avatarOrigin)}/api/v1/avatars/[a-f0-9]{64}/[a-f0-9]{64}\\.webp$`, 'error-message': 'modPictureInvalid' } }, annotations: { inputType: 'html5-url' } },
  ];
  for (const desired of managedAttributes) {
    const current = profile.attributes.find(attribute => attribute.name === desired.name);
    const values = { ...current, ...desired, multivalued: false,
      permissions: { view: ['admin', 'user'], edit: ['admin', 'user'] } };
    delete values.required;
    if (current) Object.assign(current, values);
    else profile.attributes.push(values);
    if (current) delete current.required;
  }
  await api('PUT', `${route}/users/profile`, profile);
  await api('PUT', '/realms/master', { displayName: realm.displayName, displayNameHtml: realm.displayNameHtml,
    loginTheme: realm.loginTheme, accountTheme: realm.accountTheme,
    internationalizationEnabled: true, supportedLocales: ['pl', 'en'], defaultLocale: 'pl' });

  await synchronizeRealmRoles(api, route, realm.roles.realm);
  const ids = new Map();
  for (const desired of realm.clients) {
    const matches = await api('GET', `${route}/clients?clientId=${encode(desired.clientId)}`);
    const current = matches.find(client => client.clientId === desired.clientId);
    if (!current) await api('POST', `${route}/clients`, desired);
    else {
      const values = { ...current, ...desired };
      // Existing client secrets may already be used by integrations, preserve them.
      delete values.secret;
      const names = new Set((desired.protocolMappers ?? []).map(mapper => mapper.name));
      values.protocolMappers = [...(current.protocolMappers ?? []).filter(mapper => !names.has(mapper.name)), ...(desired.protocolMappers ?? [])];
      await api('PUT', `${route}/clients/${encode(current.id)}`, values);
    }
    const clients = await api('GET', `${route}/clients?clientId=${encode(desired.clientId)}`);
    ids.set(desired.clientId, clients.find(client => client.clientId === desired.clientId).id);
  }
  const management = (await api('GET', `${route}/clients?clientId=realm-management`)).find(client => client.clientId === 'realm-management');
  for (const account of realm.users ?? []) {
    if (!account.serviceAccountClientId) throw new Error('Human account seeding is not supported');
    const clientId = ids.get(account.serviceAccountClientId);
    const user = await api('GET', `${route}/clients/${encode(clientId)}/service-account-user`);
    const roles = await Promise.all((account.realmRoles ?? []).map(name => api('GET', `${route}/roles/${encode(name)}`)));
    if (roles.length) await api('POST', `${route}/users/${encode(user.id)}/role-mappings/realm`, roles);
    const permissions = await Promise.all((account.clientRoles?.['realm-management'] ?? []).map(name =>
      api('GET', `${route}/clients/${encode(management.id)}/roles/${encode(name)}`)));
    if (permissions.length) {
      await api('POST', `${route}/users/${encode(user.id)}/role-mappings/clients/${encode(management.id)}`, permissions);
      await api('POST', `${route}/clients/${encode(clientId)}/scope-mappings/clients/${encode(management.id)}`, permissions);
    }
  }
  console.log('FORMIQ realm, application roles, read-only directory client and login/account themes configured. Existing users and secrets preserved.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
