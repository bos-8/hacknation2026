import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { webEnvironment } from '../../scripts/web.mjs';

test('Web startup resolves local CA independently of command working directory', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'modulon-web-env-'));
  t.after(async () => {
    const verified = await realpath(temporary);
    assert.equal(path.dirname(verified).toLowerCase(), (await realpath(os.tmpdir())).toLowerCase());
    assert.ok(path.basename(verified).startsWith('modulon-web-env-'));
    await rm(verified, { recursive: true, force: true });
  });
  await mkdir(path.join(temporary, 'apps/web'), { recursive: true });
  await mkdir(path.join(temporary, 'infra/local/certs'), { recursive: true });
  await writeFile(path.join(temporary, 'apps/web/.env'), 'AUTH_BASE_URL=https://localhost:3000\n');
  const ca = path.join(temporary, 'infra/local/certs/rootCA.pem');
  await writeFile(ca, 'test trust-root path fixture');
  const local = await webEnvironment(temporary, {});
  assert.equal(local.NODE_EXTRA_CA_CERTS, ca);
  assert.equal(local.WEB_TLS_CERT, path.join(temporary, 'infra/local/certs/localhost.pem'));
  assert.equal(local.WEB_TLS_KEY, path.join(temporary, 'infra/local/certs/localhost-key.pem'));
  assert.equal((await webEnvironment(temporary, { AUTH_BASE_URL: 'https://prod.example.invalid' })).NODE_EXTRA_CA_CERTS, undefined);
  assert.equal((await webEnvironment(temporary, { NODE_EXTRA_CA_CERTS: 'explicit-root.pem' })).NODE_EXTRA_CA_CERTS, 'explicit-root.pem');
  await mkdir(path.join(temporary, 'infra/local/custom-trust'), { recursive: true });
  const custom = path.join(temporary, 'infra/local/custom-trust/issuer.pem');
  await writeFile(custom, 'custom fixture');
  await writeFile(path.join(temporary, 'infra/local/.env.dev'), 'CERTS_DIR=./custom-trust\nTLS_CA_PEM=issuer.pem\n');
  assert.equal((await webEnvironment(temporary, {})).NODE_EXTRA_CA_CERTS, custom);
  assert.equal((await webEnvironment(temporary, { CERTS_DIR: './certs', TLS_CA_PEM: 'rootCA.pem' })).NODE_EXTRA_CA_CERTS, ca);
  const key = path.join(temporary, 'private', 'server.key');
  const overrides = await webEnvironment(temporary, { TLS_CERT_PEM: 'server.pem', TLS_CERT_KEY: key });
  assert.equal(overrides.WEB_TLS_CERT, path.join(temporary, 'infra/local/custom-trust/server.pem'));
  assert.equal(overrides.WEB_TLS_KEY, key);
});
