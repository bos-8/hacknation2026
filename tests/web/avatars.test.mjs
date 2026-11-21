import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { AVATAR_MAX_BYTES, createAvatarService, getAvatarConfig, normalizeAvatar } from '../../apps/web/src/server/avatars.ts';
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const sharp = require('sharp');
const boundary = { appOrigin: 'https://app.example.invalid', accountOrigin: 'https://auth.example.invalid', secret: 'x'.repeat(48) };
const uuid = '11111111-2222-4333-8444-555555555555';
const identify = async () => ({ keycloakUuid: uuid });
const image = await sharp({ create: { width: 32, height: 16, channels: 3, background: '#15803d' } }).png().toBuffer();
const request = (body = image, headers = {}) => new Request(boundary.appOrigin + '/api/v1/profile/avatar', {
  method: 'POST', headers: { origin: boundary.accountOrigin, 'content-type': 'image/png', ...headers }, body,
});
const fixture = () => {
  const files = new Map();
  const store = { async put(key, value) { files.set(key, value); }, async get(key) { return files.get(key) ?? null; } };
  return { files, service: createAvatarService(boundary, store) };
};

test('avatar configuration redacts secrets and restricts server endpoints', () => {
  assert.throws(() => getAvatarConfig({ S3_AVATAR_SECRET_KEY: 'private-fixture' }), error => !error.message.includes('private-fixture'));
  assert.throws(() => getAvatarConfig({ S3_AVATAR_ENDPOINT: 'http://untrusted.example.invalid' }));
});
test('malformed avatar URLs produce field-only errors without retaining the invalid input', () => {
  const config = { S3_AVATAR_REGION: 'eu-central-1', S3_AVATAR_BUCKET: 'avatars',
    S3_AVATAR_ACCESS_KEY: 'fixture', S3_AVATAR_SECRET_KEY: 'x'.repeat(32) };
  for (const endpoint of ['malformed-private-fixture', 'https://[private-fixture']) {
    assert.throws(() => getAvatarConfig({ ...config, S3_AVATAR_ENDPOINT: endpoint }), error => {
      assert.equal(error.message, 'Invalid avatar configuration: S3_AVATAR_ENDPOINT');
      assert.equal(Object.hasOwn(error, 'input'), false);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('avatars require an authenticated identity and exact allowed origin', async () => {
  const { service, files } = fixture();
  assert.equal((await service.upload(request(image, { origin: 'https://evil.example.invalid' }), identify)).status, 403);
  assert.equal((await service.upload(request(), async () => null)).status, 401);
  assert.equal((await service.upload(request(), async () => ({ keycloakUuid: '../other-user' }))).status, 401);
  assert.equal(files.size, 0);
  const preflight = await service.upload(new Request(boundary.appOrigin, { method: 'OPTIONS', headers: { origin: boundary.accountOrigin } }), async () => { throw Error('Must not authenticate preflight'); });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), boundary.accountOrigin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
});
test('avatar upload normalizes pixels and derives ownership only from the session', async () => {
  const { service, files } = fixture();
  const response = await service.upload(request(), identify);
  assert.equal(response.status, 200);
  const { url } = await response.json();
  assert.ok(url.startsWith(boundary.appOrigin + '/api/v1/avatars/'));
  assert.ok(!url.includes(uuid));
  const [owner, file] = new URL(url).pathname.split('/').slice(-2);
  assert.match(owner, /^[a-f0-9]{64}$/);
  const object = files.get(`${owner}/${file}`);
  const info = await sharp(object).metadata();
  assert.equal(info.format, 'webp'); assert.equal(info.width, 256); assert.equal(info.height, 256);
  assert.equal(info.exif, undefined);
  const read = await service.read(owner, file);
  assert.equal(read.status, 200); assert.equal(read.headers.get('content-type'), 'image/webp');
  assert.equal(read.headers.get('x-content-type-options'), 'nosniff');
  const another = await service.upload(request(), async () => ({ keycloakUuid: '22222222-3333-4444-8555-666666666666' }));
  assert.notEqual((await another.json()).url, url);
  assert.equal(files.size, 2);
});
test('avatars reject disguised SVG, corrupt images and oversized bodies without storage writes', async () => {
  const { service, files } = fixture();
  assert.equal((await service.upload(request('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>'), identify)).status, 415);
  assert.equal((await service.upload(request('not an image'), identify)).status, 415);
  assert.equal((await service.upload(request(image, { 'content-length': String(AVATAR_MAX_BYTES + 1) }), identify)).status, 413);
  assert.equal((await service.upload(request(new Uint8Array(AVATAR_MAX_BYTES + 1)), identify)).status, 413);
  assert.equal(files.size, 0);
  await assert.rejects(normalizeAvatar(new Uint8Array()), /size/);
});
test('avatar reads validate object paths and uploads have a per-identity limit', async () => {
  const { service, files } = fixture();
  assert.equal((await service.read('../other', 'file.webp')).status, 404);
  assert.equal((await service.read('a'.repeat(64), 'b'.repeat(64) + '.webp')).status, 404);
  for (let count = 0; count < 6; count++) await service.upload(request('bad image'), identify);
  assert.equal((await service.upload(request(), identify)).status, 429);
  assert.equal(files.size, 0);
});
