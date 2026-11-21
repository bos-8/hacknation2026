import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseProductQuery, productUrlParams, formatProductPrice } from '../../apps/web/src/schemas/product.ts';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const ts = require('typescript');
const { createElement: h, cloneElement } = require('react');
const { renderToString } = require('react-dom/server');
const { createTranslator, NextIntlClientProvider } = require('next-intl');
const root = new URL('../../apps/web/src/', import.meta.url);
const state = globalThis.__productsTest = {};
const nextModules = new Map(['next/navigation', 'next/link', 'next/image'].map(name => [name, pathToFileURL(require.resolve(name)).href]));
const mocks = new Map([
  ['server-only', ''],
  ['@/server/auth/admin-access', 'export const requireAdminAccess = () => globalThis.__productsTest.authorize(); export const getAdminAccess = async () => globalThis.__productsTest.access;'],
  ['@/server/auth/admin-action', 'export const withAdminSession = async action => globalThis.__productsTest.access === "allowed" ? action("019a75c0-0000-7000-8000-000000000002") : {status:"denied"};'],
  ['next-intl/server', 'export const getTranslations = async () => globalThis.__productsTest.translate;'],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './database.ts' && ['server/products.ts', 'server/product-status.ts'].some(path => context.parentURL === new URL(path, root).href)) return {
      url: 'data:text/javascript,export const getDatabase = () => globalThis.__productsTest.database;', shortCircuit: true,
    };
    if (mocks.has(specifier)) return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true };
    if (nextModules.has(specifier)) return nextResolve(nextModules.get(specifier), context);
    const candidate = specifier.startsWith('@/') ? new URL(specifier.slice(2), root) :
      context.parentURL?.startsWith(root.href) && specifier.startsWith('.') ? new URL(specifier, context.parentURL) : null;
    if (candidate) for (const suffix of ['', '.ts', '.tsx', '/index.ts']) {
      const target = fileURLToPath(candidate) + suffix;
      if (existsSync(target) && statSync(target).isFile()) return nextResolve(pathToFileURL(target).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith(root.href) || !url.endsWith('.tsx')) return nextLoad(url, context);
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }, fileName: fileURLToPath(url),
    }).outputText };
  },
});
const { default: ProductsPage } = await import('../../apps/web/src/app/[locale]/admin/products/page.tsx');
const { loadProducts } = await import('../../apps/web/src/server/products.ts');
const { TablePaginator } = await import('../../apps/web/src/ui/components/table-paginator.tsx');
const { NotificationProvider } = await import('../../apps/web/src/ui/components/notification-provider.tsx');
const { ProductImagePreview } = await import('../../apps/web/src/app/[locale]/admin/products/product-image-preview.tsx');
const { ImagePreviewDropdown } = await import('../../apps/web/src/ui/components/image-preview-dropdown.tsx');
const { AsideSection } = await import('../../apps/web/src/ui/components/aside-section.tsx');
const { changeProductStatus, permanentlyDeleteProduct, saveProduct } = await import('../../apps/web/src/app/[locale]/admin/products/actions.ts');
const { productStatusChangeSchema } = await import('../../apps/web/src/schemas/product-status.ts');

function fixture(products = []) {
  const reads = [];
  state.authorize = async () => {};
  state.access = 'allowed';
  state.database = {
    product: {
      count: async args => { reads.push(['count', args]); return products.length; },
      findMany: async args => { reads.push(['list', args]); return products; },
    },
    $transaction: async values => Promise.all(values),
  };
  return reads;
}

test('product mutations reject denied access and invalid transitions before database writes', async () => {
  fixture();
  const input = { uuid: '019a75c0-0000-7000-8000-000000000001', expectedStatus: 'active', status: 'inactive' };
  state.database = new Proxy({}, { get() { throw new Error('Unexpected database access'); } });
  state.access = 'forbidden';
  assert.deepEqual(await changeProductStatus(input), { status: 'denied' });
  assert.deepEqual(await permanentlyDeleteProduct(input), { status: 'denied' });
  state.access = 'allowed';
  for (const status of ['active', 'archived', 'softdelete', 'perma_delete']) {
    assert.equal(productStatusChangeSchema.safeParse({ ...input, status }).success, false);
    assert.deepEqual(await changeProductStatus({ ...input, status }), { status: 'invalid' });
  }
  assert.deepEqual(await permanentlyDeleteProduct({ ...input, uuid: 'invalid' }), { status: 'invalid' });
});

test('product status writes use the verified actor and reject stale or missing records', async () => {
  fixture();
  const writes = [];
  let count = 1;
  state.database = { product: { updateMany: async args => { writes.push(args); return { count }; } } };
  const input = { uuid: '019a75c0-0000-7000-8000-000000000001', expectedStatus: 'active', status: 'pending_deletion', updatedByUuid: 'forged' };
  assert.deepEqual(await changeProductStatus(input), { status: 'ok' });
  assert.deepEqual(writes[0], { where: { uuid: input.uuid, status: 'active' }, data: { status: 'pending_deletion', updatedByUuid: '019a75c0-0000-7000-8000-000000000002' } });
  count = 0;
  assert.deepEqual(await changeProductStatus(input), { status: 'conflict' });
  state.database.product.updateMany = async () => { throw new Error('private database details'); };
  assert.deepEqual(await changeProductStatus(input), { status: 'failed' });
});

test('permanent product deletion checks the expected state and preserves the image catalog', async () => {
  fixture();
  const writes = [];
  let count = 1;
  // No file/storage methods are provided: deleting a product must not use them.
  state.database = { product: { deleteMany: async args => { writes.push(args); return { count }; } }, $executeRaw: async () => 1 };
  state.database.$transaction = callback => callback(state.database);
  const input = { uuid: '019a75c0-0000-7000-8000-000000000001', expectedStatus: 'pending_deletion', expectedUpdatedAt: '2026-11-12T12:00:00.000Z' };
  assert.deepEqual(await permanentlyDeleteProduct(input), { status: 'ok' });
  assert.deepEqual(writes, [{ where: { uuid: input.uuid, status: 'pending_deletion', updatedAt: new Date(input.expectedUpdatedAt) } }]);
  count = 0;
  assert.deepEqual(await permanentlyDeleteProduct(input), { status: 'conflict' });
  state.database.product.deleteMany = async () => { throw new Error('private database details'); };
  assert.deepEqual(await permanentlyDeleteProduct(input), { status: 'failed' });
});

test('PL/EN product rows expose four lifecycle actions, permanent deletion and the disabled filled current state', async () => {
  const date = new Date('2026-11-12T12:00:00Z');
  for (const locale of ['en', 'pl']) for (const status of ['active', 'inactive', 'pending_archiving', 'pending_deletion']) {
    fixture([{ uuid: '019a75c0-0000-7000-8000-000000000001', code: 'PRD', name: 'Lamp', description: null, status,
      price: { toFixed: () => '1.0000' }, currency: 'PLN', imageFileUuid: null, imageFile: null,
      createdAt: date, updatedAt: date, lastArchivedAt: null, createdByUuid: 'fixture', updatedByUuid: 'fixture' }]);
    const html = (await view(locale)).html();
    assert.equal((html.match(/data-current-status="true"/g) ?? []).length, 1);
    const current = html.match(/<button[^>]*data-current-status="true"[^>]*>[\s\S]*?<\/button>/)?.[0];
    assert.match(current, /disabled/);
    assert.match(current, /fill|split/i);
    assert.match(html, /role="separator"/);
    assert.match(html, /aria-haspopup="dialog"/);
    assert.equal((html.match(/<button[^>]*aria-label="Lamp — /g) ?? []).length, 6);
    const group = html.match(/<div role="group" aria-label="[^"]*Lamp"[^>]*>[\s\S]*?<\/div>/)?.[0];
    assert.ok(group.indexOf('aria-controls="product-edit-panel"') < group.indexOf('role="separator"'));
    assert.ok(group.indexOf('role="separator"') < group.indexOf('data-current-status='));
  }
});

test('product editing validates access and data, detects concurrent updates and preserves image/lifecycle fields', async () => {
  fixture();
  const form = new FormData();
  Object.entries({ uuid: '019a75c0-0000-7000-8000-000000000001', expectedUpdatedAt: '2026-11-12T12:00:00.000Z',
    code: 'prd-edited', name: 'Edited lamp', description: '', price: '999999999999999,1234', currency: 'pln',
    status: 'archived', imageFileUuid: 'forged', updatedByUuid: 'forged' }).forEach(([key, value]) => form.set(key, value));
  const writes = [];
  let count = 1;
  state.database = { product: { updateMany: async args => { writes.push(args); return { count }; } } };
  state.access = 'forbidden';
  assert.deepEqual(await saveProduct(form), { status: 'denied' });
  assert.equal(writes.length, 0);
  state.access = 'allowed';
  assert.deepEqual(await saveProduct(form), { status: 'ok', uuid: form.get('uuid') });
  assert.deepEqual(writes[0], { where: { uuid: form.get('uuid'), updatedAt: new Date(form.get('expectedUpdatedAt')) },
    data: { code: 'PRD-EDITED', name: 'Edited lamp', description: null, price: '999999999999999.1234', currency: 'PLN', updatedByUuid: '019a75c0-0000-7000-8000-000000000002' } });
  count = 0;
  assert.deepEqual(await saveProduct(form), { status: 'conflict' });
  state.database.product.updateMany = async () => { throw Object.assign(new Error('private'), { code: 'P2002' }); };
  assert.deepEqual(await saveProduct(form), { status: 'duplicate' });
  form.set('price', '-1');
  assert.equal((await saveProduct(form)).status, 'invalid');
});
async function view(locale = 'en', searchParams = {}, loaded = true) {
  const messages = JSON.parse(readFileSync(new URL(`../../apps/web/messages/${locale}/common.json`, import.meta.url), 'utf8'));
  state.translate = createTranslator({ locale, messages, namespace: 'common.admin.products' });
  const shell = ProductsPage({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(searchParams) });
  const element = await shell.props.children.type(shell.props.children.props);
  const results = element.props.children[1];
  let display = element;
  if (loaded) {
    const response = await results.props.refreshAction();
    display = cloneElement(element, {}, element.props.children[0], cloneElement(results, { initial: response.status === 'ok' ? response.page : null }), element.props.children[2]);
  }
  return { element, html: () => renderToString(h(NotificationProvider, null, h(NextIntlClientProvider, { locale, messages, timeZone: 'Europe/Warsaw' }, display))) };
}

test('product list validates bounded query parameters and preserves filters in URLs', () => {
  const query = parseProductQuery({ page: '2', limit: '10', search: ' lamp ', status: 'archived', image: 'without', sort: 'price', direction: 'desc' });
  assert.deepEqual(productUrlParams(query), { page: '2', limit: '10', search: 'lamp', status: 'archived', image: 'without', sort: 'price', direction: 'desc' });
  for (const params of [{ page: '999999', limit: '100000' }, { page: ['2'], search: ['lamp'], status: 'unknown', image: 'bad', sort: 'uuid;DROP' }]) {
    const parsed = parseProductQuery(params);
    assert.equal(parsed.page, 1); assert.equal(parsed.limit, 25); assert.equal(parsed.sort, 'code');
    assert.equal(parsed.status, undefined); assert.equal(parsed.image, undefined);
  }
});

test('product money formatting retains all Decimal digits including values beyond float precision', () => {
  assert.match(formatProductPrice('999999999999999.9999', 'PLN', 'en'), /999,999,999,999,999\.9999/);
  assert.equal(formatProductPrice('12.3400', 'USD', 'en'), '$12.34');
  assert.match(formatProductPrice('0.0000', 'PLN', 'pl'), /0,00/);
  assert.throws(() => formatProductPrice('-1', 'USD', 'en'));
  assert.throws(() => formatProductPrice('1', 'bad', 'en'));
});

test('product page authorizes before any database reads and refresh rechecks authorization', async () => {
  const reads = fixture();
  state.authorize = async () => { throw new Error('denied'); };
  await assert.rejects(view(), /denied/);
  assert.deepEqual(reads, []);
  state.authorize = async () => {};
  const { element } = await view();
  reads.length = 0; state.access = 'forbidden';
  assert.deepEqual(await element.props.children[1].props.refreshAction(), { status: 'denied' });
  assert.deepEqual(reads, []);
});

test('product reads filter and sort on the server before bounded pagination', async () => {
  const reads = fixture();
  await loadProducts(parseProductQuery({ page: '3', limit: '10', search: '100%', status: 'inactive', image: 'without', sort: 'price', direction: 'desc' }));
  const args = reads.find(([kind]) => kind === 'list')[1];
  assert.equal(args.skip, 20); assert.equal(args.take, 10);
  assert.equal(args.where.status, 'inactive'); assert.equal(args.where.imageFileUuid, null);
  assert.equal(args.where.OR[0].name.contains, '100\\%');
  assert.deepEqual(args.orderBy, [{ price: 'desc' }, { uuid: 'asc' }]);
});

test('PL/EN product tables render exact prices, optional image state, escaped names and action column borders', async () => {
  const date = new Date('2026-11-12T12:00:00Z');
  fixture([{ uuid: '019a75c0-0000-7000-8000-000000000001', code: 'PRD-001', name: '<script>lamp</script>', description: null,
    status: 'active', price: { toFixed: () => '12.3400' }, currency: 'PLN', imageFileUuid: null, imageFile: null,
    createdAt: date, updatedAt: date, lastArchivedAt: null, createdByUuid: 'fixture', updatedByUuid: 'fixture' }]);
  for (const locale of ['pl', 'en']) {
    const html = (await view(locale, { search: 'lamp' })).html();
    const searchForm = html.match(/<form[^>]*role="search"[\s\S]*?<\/form>/)?.[0];
    assert.ok(searchForm);
    assert.equal([...searchForm.matchAll(/name="search"/g)].length, 1, 'Search has one editable value, without a stale hidden duplicate');
    assert.match(html, /PRD-001/); assert.match(html, /&lt;script&gt;lamp&lt;\/script&gt;/);
    assert.match(html, /border-l border-table-border/);
    assert.match(html, locale === 'pl' ? /Bez zdjęcia/ : /Without image/);
    assert.match(html, locale === 'pl' ? /12,34/ : /12\.34/);
  }
});

test('product list distinguishes an empty catalog from a database error', async () => {
  fixture();
  const empty = (await view()).html();
  assert.match(empty, /No data/);
  assert.match(empty, /<table/); assert.match(empty, /aria-label="Product list pages"/);
  assert.doesNotMatch(empty, /role="alert"/);
  state.database.product.findMany = async () => { throw new Error('private connection details'); };
  const html = (await view()).html();
  assert.match(html, /<table/); assert.match(html, /<thead/); assert.match(html, /aria-label="Product list pages"/);
  assert.match(html, /<td[^>]*colSpan="9"|<td[^>]*colspan="9"/i);
  assert.match(html, /Loading data/);
  assert.match(html, /Results — of —/); assert.match(html, /Page — of —/);
  assert.doesNotMatch(html, /border-danger bg-danger\/10/);
  assert.doesNotMatch(html, /private connection details/);
});

test('product image cells show absence icons or protected links without loading images', async () => {
  const date = new Date('2026-11-12T12:00:00Z');
  const product = { uuid: '019a75c0-0000-7000-8000-000000000001', code: 'PRD', name: 'Lamp', description: null,
    status: 'active', price: { toFixed: () => '1.0000' }, currency: 'PLN', imageFileUuid: null, imageFile: null,
    createdAt: date, updatedAt: date, lastArchivedAt: null, createdByUuid: 'fixture', updatedByUuid: 'fixture' };
  fixture([product]);
  const missing = (await view()).html();
  assert.match(missing, /role="img" aria-label="Without image"/);
  assert.match(missing, /bi-slash-lg/);
  fixture([{ ...product, imageFileUuid: '019a75c0-0000-7000-8000-000000000002', imageFile: { name: 'lamp.webp' } }]);
  const image = (await view()).html();
  assert.match(image, /href="\/en\/admin\/files\?file=019a75c0-0000-7000-8000-000000000002&amp;preview=image"/);
  assert.doesNotMatch(image, /target="_blank"/);
  assert.match(image, /bi-image-fill/);
  assert.doesNotMatch(image, /<img[^>]*src="[^\"]*\/image"/);
});

test('product info image dropdown starts collapsed and makes no image request when rendered', t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected image request'); });
  const messages = JSON.parse(readFileSync(new URL('../../apps/web/messages/en/common.json', import.meta.url), 'utf8'));
  const html = renderToString(h(NextIntlClientProvider, { locale: 'en', messages, timeZone: 'Europe/Warsaw' },
    h(ProductImagePreview, { uuid: '019a75c0-0000-7000-8000-000000000001', name: 'Lamp', updatedAt: new Date() })));
  assert.match(html, /<button[^>]*aria-expanded="false"[^>]*>Image preview/);
  assert.doesNotMatch(html, /<img|Loading image/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('additional information shares the unframed expandable aside section and hides metadata until opened', () => {
  const html = renderToString(h(AsideSection, { title: 'Additional information' }, h('dl', null, h('dt', null, 'UUID'), h('dd', null, 'fixture'))));
  assert.match(html, /<section class="-mx-4 mb-4">/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /border-b border-border/);
  assert.doesNotMatch(html, /<dl|UUID|border border-border|rounded/);
});

test('file image dropdown defers its preview until expanded and accepts automatic expansion from product links', () => {
  const messages = JSON.parse(readFileSync(new URL('../../apps/web/messages/en/common.json', import.meta.url), 'utf8'));
  const render = defaultOpen => renderToString(h(NextIntlClientProvider, { locale: 'en', messages, timeZone: 'Europe/Warsaw' },
    h(ImagePreviewDropdown, { imageUrl: '/api/v1/admin/files/fixture/image', name: 'Lamp', defaultOpen })));
  const collapsed = render(false);
  assert.match(collapsed, /<button[^>]*aria-expanded="false"[^>]*>Image preview/);
  assert.doesNotMatch(collapsed, /Loading image|<img/);
  assert.match(collapsed, /grid-template-rows:0fr/);
  const expanded = render(true);
  assert.match(expanded, /aria-expanded="true"/);
  assert.match(expanded, /grid-template-rows:1fr/);
  assert.match(expanded, /Loading image/);
});

test('product SSR shell renders headers, toolbar and loading body without waiting for any database read', async () => {
  const reads = fixture();
  state.database.product.findMany = () => new Promise(() => {});
  const shell = await view('en', {}, false);
  assert.deepEqual(reads, []);
  const html = shell.html();
  assert.match(html, /<table/); assert.match(html, /Loading data/); assert.match(html, /Product list pages/);
  assert.match(html, /Add product/); assert.doesNotMatch(html, /role="alert"/);
});

test('shared PL/EN paginator exposes last page, independent counters, bounded page input and preserved filters for all tables', () => {
  for (const locale of ['pl', 'en']) for (const namespace of ['users', 'files', 'products']) {
    const messages = JSON.parse(readFileSync(new URL(`../../apps/web/messages/${locale}/common.json`, import.meta.url), 'utf8'));
    const html = renderToString(h(NextIntlClientProvider, { locale, messages, timeZone: 'Europe/Warsaw' }, h(TablePaginator, {
      locale, namespace: `common.admin.${namespace}`, pathname: `/admin/${namespace}`, params: { page: '2', limit: '10', search: 'lamp' },
      page: 2, limit: 10, total: 45, rowCount: 10, sizes: [1, 10, 25, 50],
    })));
    assert.match(html, locale === 'pl' ? /Wyniki 11–20 z 45/ : /Results 11–20 of 45/);
    assert.match(html, locale === 'pl' ? /Strona 2 z 5/ : /Page 2 of 5/);
    const last = [...html.matchAll(/<a\b[^>]+>/g)].find(([tag]) => tag.includes(locale === 'pl' ? 'aria-label="Ostatnia strona"' : 'aria-label="Last page"'))?.[0];
    assert.ok(last); assert.match(last, /page=5/); assert.match(last, /search=lamp/);
    const pageInput = [...html.matchAll(/<input\b[^>]+>/g)].find(([tag]) => tag.includes('name="page"') && tag.includes('type="number"'))?.[0];
    assert.ok(pageInput); assert.match(pageInput, /min="1"/); assert.match(pageInput, /max="5"/);
    assert.match(html, /name="limit" value="10"/);
  }
});
