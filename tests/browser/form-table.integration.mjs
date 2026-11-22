import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createDatabaseClient } from '../../packages/database/dist/index.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '../../.local/ui-check/node_modules/playwright/index.mjs');
const web = parseEnv(readFileSync('apps/web/.env', 'utf8'));
const dev = parseEnv(readFileSync('infra/local/.env.dev', 'utf8'));
const origin = new URL(web.AUTH_BASE_URL).origin;
const issuer = new URL(web.AUTH_ISSUER).origin;
assert.equal(dev.ENV_MODE, 'dev');
assert.equal(dev.STACK_NAME, 'formiqdev');
assert.equal(new URL(origin).hostname, 'localhost');
assert.equal(new URL(issuer).hostname, 'localhost');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(web.DATABASE_URL).hostname));

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--no-proxy-server'],
});
const page = await browser.newPage({ ignoreHTTPSErrors: true });
page.setDefaultTimeout(30_000);
const prefix = 'batch-' + randomUUID();
const limit = 20 * 1024 ** 2;
const files = Array.from({ length: 8 }, (_, i) => ({
  name: prefix + '-' + (i + 1) + (i === 1 ? '.JSON' : '.txt'),
  mimeType: i === 1 ? 'application/json' : 'text/plain',
  buffer: i === 1 ? Buffer.from('{}') : Buffer.alloc(i === 0 ? limit : i + 1, 'a'),
}));
const db = createDatabaseClient({ connectionString: web.DATABASE_URL });
const fixtureNames = files.map(file => file.name);
const accepted = [];
try {
  await page.goto(origin + '/en');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#kc-login').waitFor();
  assert.equal(new URL(page.url()).origin, issuer);
  await page.locator('[name=username]').fill('user@formiq.test');
  await page.locator('[name=password]').fill(dev.DEV_SEED_USER_PASSWORD || 'user');
  await page.locator('#kc-login').click();
  await page.waitForURL(url => url.origin === origin && !url.pathname.startsWith('/api/'));
  console.log('PASS local user sign-in');
  await page.goto(origin + '/en/forms?search=' + prefix + '&limit=1');
  await page.getByRole('button', { name: 'Add form', exact: true }).click();
  const input = page.locator('#form-upload-file');
  const submit = page.locator('#form-upload button[type=submit]');
  assert.equal(await input.getAttribute('multiple'), '');
  await input.setInputFiles(Array.from({ length: 9 }, (_, i) => ({ ...files[7], name: prefix + i + '.txt' })));
  await page.getByText('Choose at most 8 files at once.').waitFor();
  assert.equal(await submit.isDisabled(), true);
  await input.setInputFiles({ ...files[0], buffer: Buffer.alloc(limit + 1, 'a') });
  await page.locator('#form-upload-error').getByText(/too large/i).waitFor();
  assert.equal(await submit.isDisabled(), true);

  console.log('PASS 9-file and oversized selection rejected');
  let failOnce = true;
  await page.route('**/api/v1/forms', async route => {
    if (failOnce && route.request().headers()['x-file-name'] === files[6].name) {
      failOnce = false;
      return route.fulfill({ status: 503, body: '{}' });
    }
    return route.continue();
  });
  page.on('response', response => {
    const request = response.request();
    if (request.method() !== 'POST' || response.url() !== origin + '/api/v1/forms') return;
    const name = request.headers()['x-file-name'];
    if (response.status() === 201 && fixtureNames.includes(name)) accepted.push(name);
  });
  await input.setInputFiles(files);
  await submit.click();
  await page.locator('#form-upload-error').getByText(new RegExp(files[6].name)).waitFor();
  console.log('PASS partial upload feedback');
  assert.deepEqual(await page.locator('#form-upload-selection li').allTextContents(), [files[6].name]);
  await submit.click();
  await page.locator('#forms-upload[aria-hidden=true]').waitFor({ state: 'attached' });
  assert.deepEqual(accepted.toSorted(), fixtureNames.toSorted());
  console.log('PASS one record accepted per selected file');

  const table = page.getByRole('table', { name: 'Forms' });
  const columns = table.getByRole('columnheader');
  for (const [index, column] of ['name', 'extension', 'size', 'processed', 'paid'].entries()) {
    for (const direction of ['ascending', 'descending']) {
      await columns.nth(index).getByRole('link').click();
      await page.waitForURL(url => url.searchParams.get('sort') === column &&
        url.searchParams.get('direction') === (direction === 'ascending' ? 'asc' : 'desc'));
      await table.locator(`th:nth-child(${index + 1})[aria-sort="${direction}"]`).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('search'), prefix);
      if (column === 'extension' && direction === 'ascending') {
        assert.equal(await table.locator('tbody tr td').nth(1).textContent(), 'JSON');
      }
      if (column === 'size' && direction === 'descending') {
        assert.equal(await table.locator('tbody tr td').first().textContent(), files[0].name);
      }
    }
  }
  console.log('PASS selection limits, 8 uploads including exactly 20 MiB, partial retry, 5 sortable columns across pages.');
} finally {
  try {
    const fixtures = await db.file.findMany({ where: { name: { in: fixtureNames } }, select: { uuid: true } });
    for (const { uuid } of fixtures) {
      const response = await page.request.delete(origin + '/api/v1/forms/' + uuid, { headers: { origin }, timeout: 15000 });
      assert.equal(response.status(), 200, 'Remove the uploaded test fixture');
    }
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}
