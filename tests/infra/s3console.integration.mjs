// Explicit opt-in: authenticated official Admin UI check using one disposable filer directory.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { S3Console } from '../../scripts/s3console.mjs';

const { values } = parseArgs({ options: { mode: { type: 'string', default: 'dev' }, port: { type: 'string' } } });
const consoleTool = new S3Console({ mode: values.mode, port: values.port });
const { bundle } = await consoleTool.settings();
const origin = `http://127.0.0.1:${consoleTool.port}`;
const jar = new Map();
async function request(route, options = {}, authenticated = true) {
  const headers = { ...options.headers };
  if (authenticated) headers.Cookie = [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
  const response = await fetch(origin + route, { ...options, headers, signal: AbortSignal.timeout(15000), redirect: 'manual' });
  if (authenticated) for (const cookie of response.headers.getSetCookie()) {
    if (values.https) assert.ok(/;\s*Secure(?:;|$)/i.test(cookie) && /;\s*HttpOnly(?:;|$)/i.test(cookie), 'HTTPS console cookies must be Secure and HttpOnly');
    const [pair] = cookie.split(';'); const separator = pair.indexOf('=');
    jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return response;
}
async function login(password) {
  const page = await request('/login');
  assert.equal(page.status, 200);
  const token = (await page.text()).match(/name="csrf_token" value="([^"]+)"/)?.[1];
  assert.ok(token, 'Login CSRF token missing');
  return request('/login', { method: 'POST', body: new URLSearchParams({ username: bundle.WEED_ADMIN_USER, password, csrf_token: token }) });
}
const directory = '/modulon-console-test-' + randomBytes(8).toString('hex');
assert.match(directory, /^\/modulon-console-test-[a-f0-9]{16}$/);
const file = directory + '/diagnostic.txt';
const content = 'Disposable official SeaweedFS Admin UI fixture.\n';
let uploaded = false;
try {
  const anonymous = await request('/files', {}, false);
  assert.ok([302, 303, 307].includes(anonymous.status) && anonymous.headers.get('location') === '/login', 'Anonymous file access must require login');
  await login('incorrect-' + randomBytes(32).toString('hex'));
  assert.notEqual((await request('/files')).status, 200, 'Invalid password must not create an authenticated session');
  const missingCsrf = await request('/login', { method: 'POST', body: new URLSearchParams({ username: bundle.WEED_ADMIN_USER, password: bundle.WEED_ADMIN_PASSWORD }) });
  assert.equal(missingCsrf.status, 303);
  assert.ok(missingCsrf.headers.get('location')?.startsWith('/login?error='), 'Login without CSRF protection must fail');
  assert.notEqual((await request('/files')).status, 200);
  assert.equal((await login(bundle.WEED_ADMIN_PASSWORD)).status, 303, 'Authenticated login failed');
  assert.equal((await request('/admin')).status, 200);
  assert.equal((await request('/files?path=/buckets/')).status, 200);
  const form = new FormData();
  form.append('files', new Blob([content], { type: 'text/plain' }), 'diagnostic.txt');
  form.append('path', directory);
  const upload = await request('/api/files/upload', { method: 'POST', body: form });
  assert.ok(upload.ok, 'Admin UI upload to disposable directory failed');
  uploaded = true;
  const download = await request('/api/files/download?path=' + encodeURIComponent(file));
  assert.equal(download.status, 200);
  assert.equal(await download.text(), content);
  assert.equal((await request('/api/files/properties?path=' + encodeURIComponent(file))).status, 200);
  assert.ok((await (await request('/files?path=' + encodeURIComponent(directory))).text()).includes('diagnostic.txt'));
  console.log('PASS official Admin UI login, invalid-password and missing-CSRF rejection, protected cluster/files, upload, exact download and properties.');
} finally {
  if (uploaded) {
    for (const path of [file, directory]) {
      const removed = await request('/api/files/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
      assert.ok(removed.ok, 'Disposable Admin UI fixture cleanup failed');
    }
    console.log('PASS disposable filer file/directory removed; application buckets untouched.');
  }
}
