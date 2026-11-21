import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Agent, fetch } from 'undici';
import { ROOT, main, readEnvironment } from './lib/runtime.mjs';

main(import.meta.url, async () => {
  const env = await readEnvironment(ROOT, 'infra/local/.env.dev');
  const origin = 'https://localhost:8443';
  if (env.ENV_MODE !== 'dev' || env.STACK_NAME !== 'formiqdev' || env.AUTH_ADMIN_PUBLIC_URL !== origin) {
    throw new Error('This seed requires the local formiqdev Keycloak at https://localhost:8443.');
  }
  const users = ['admin', 'user'].map(username => {
    const key = `DEV_SEED_${username.toUpperCase()}_PASSWORD`;
    if (!env[key]) throw new Error(`Set ${key} in infra/local/.env.dev before running this seed.`);
    return {
      username, email: `${username}@formiq.test`, enabled: true, emailVerified: true,
      firstName: username, lastName: 'DEV',
      realmRoles: [username === 'admin' ? 'ROOT' : 'USER'],
      credentials: [{ type: 'password', value: env[key], temporary: false }],
    };
  });
  const ca = await readFile(path.resolve(ROOT, 'infra/local', env.CERTS_DIR, env.TLS_CA_PEM));
  const dispatcher = new Agent({ connect: { ca } });
  async function request(route, options) {
    const response = await fetch(origin + route, {
      ...options, dispatcher, redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Keycloak ${route.split('?')[0]} returned HTTP ${response.status}.`);
    return response.json();
  }
  try {
    const login = await request('/realms/master/protocol/openid-connect/token', {
      method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli',
        username: env.AUTH_ADMIN_USERNAME, password: env.AUTH_ADMIN_PASSWORD }),
    });
    const headers = { authorization: `Bearer ${login.access_token}`, 'content-type': 'application/json' };
    const realm = '/admin/realms/FORMIQ';
    const result = await request(realm + '/partialImport', {
      method: 'POST', headers, body: JSON.stringify({ ifResourceExists: 'SKIP', users }),
    });
    for (const user of users) {
      const [account] = await request(`${realm}/users?exact=true&username=${user.username}`, { headers });
      if (!account?.enabled || account.email !== user.email) {
        throw new Error(`Missing DEV identity or username conflict for ${user.username}. Check the realm in Keycloak.`);
      }
      const roles = await request(`${realm}/users/${account.id}/role-mappings/realm/composite`, { headers });
      const names = roles.map(role => role.name);
      if (!names.includes(user.realmRoles[0]) || (user.username === 'user' &&
          names.some(name => ['ADMIN', 'SADMIN', 'ROOT'].includes(name)))) {
        throw new Error(`Unexpected application roles for ${user.username}. Check the realm in Keycloak.`);
      }
    }
    console.log(`FORMIQ DEV: ${result.added} created, ${result.skipped} already present. Verified admin (ROOT) and user (USER).`);
  } finally {
    await dispatcher.close();
  }
});
