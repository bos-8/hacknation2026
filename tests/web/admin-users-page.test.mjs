import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const ts = require('typescript');
const { createElement: h, cloneElement } = require('react');
const { renderToString } = require('react-dom/server');
const { createTranslator, NextIntlClientProvider } = require('next-intl');
const root = new URL('../../apps/web/src/', import.meta.url);
const nextModules = new Map(['next/navigation', 'next/link'].map(name => [name, pathToFileURL(require.resolve(name)).href]));
const state = globalThis.__adminUsersPageTest = {};
const mocks = new Map([
  ['@/server/auth/admin-access', 'export const requireAdminAccess = (...args) => globalThis.__adminUsersPageTest.authorize(...args);'],
  ['@/server/auth/admin-action', 'export const withAdminSession = async action => {try {await globalThis.__adminUsersPageTest.authorize();} catch {return {status:"denied"};} return action("fixture");};'],
  ['@/server/auth/directory', 'export const getIdentityDirectory = () => ({listUsers: (...args) => globalThis.__adminUsersPageTest.list(...args)});'],
  ['next-intl/server', 'export const getTranslations = async () => globalThis.__adminUsersPageTest.translate;'],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks.has(specifier)) return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true };
    if (nextModules.has(specifier)) return nextResolve(nextModules.get(specifier), context);
    const candidate = specifier.startsWith('@/') ? new URL(specifier.slice(2), root) :
      context.parentURL?.startsWith(root.href) && specifier.startsWith('.') ? new URL(specifier, context.parentURL) : null;
    if (candidate) for (const suffix of ['', '.ts', '.tsx', '.js', '/index.ts']) {
      const target = fileURLToPath(candidate) + suffix;
      if (existsSync(target) && statSync(target).isFile()) return nextResolve(pathToFileURL(target).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith(root.href) || !url.endsWith('.tsx')) return nextLoad(url, context);
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
      fileName: fileURLToPath(url),
    }).outputText };
  },
});
const { default: UsersPage } = await import('../../apps/web/src/app/[locale]/admin/users/page.tsx');

async function usersView(locale = 'en', searchParams = {}) {
  const messages = JSON.parse(readFileSync(new URL(`../../apps/web/messages/${locale}/common.json`, import.meta.url), 'utf8'));
  state.translate = createTranslator({ locale, messages, namespace: 'common.admin.users' });
  const shell = UsersPage({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(searchParams) });
  const element = await shell.props.children.type(shell.props.children.props);
  return { element, messages };
}

async function content(locale = 'en', searchParams = {}) {
  const { element, messages } = await usersView(locale, searchParams);
  const results = element.props.children[1];
  const response = await results.props.refreshAction();
  const display = cloneElement(element, {}, element.props.children[0], cloneElement(results, { initial: response.status === 'ok' ? response.page : null }));
  return renderToString(h(NextIntlClientProvider, { locale, messages, timeZone: 'Europe/Warsaw' }, display));
}

test('users page checks authorization before directory reads, including direct navigation', async () => {
  let reads = 0;
  state.authorize = async () => { throw new Error('access-denied'); };
  state.list = async () => { reads++; return { users: [], total: 0 }; };
  await assert.rejects(content(), /access-denied/);
  assert.equal(reads, 0);
});

test('table refresh rechecks access and reads the current filtered page only when authorized', async () => {
  const reads = [];
  state.authorize = async () => {};
  state.list = async query => { reads.push(query); return { users: [], total: reads.length }; };
  const { element } = await usersView('en', { page: '2', enabled: 'false' });
  const { refreshAction } = element.props.children[1].props;
  assert.deepEqual(reads, []);
  assert.deepEqual(await refreshAction(), { status: 'ok', page: { users: [], total: 1 } });
  assert.deepEqual(reads, [{ page: 2, search: '', limit: 25, enabled: false }]);
  state.authorize = async () => { throw new Error('access revoked'); };
  assert.deepEqual(await refreshAction(), { status: 'denied' });
  assert.equal(reads.length, 1);
});

test('users page renders translated table, escaped account data and search-preserving pagination', async () => {
  state.authorize = async () => {};
  state.list = async query => {
    assert.deepEqual(query, { page: 1, search: 'Anna & Jan', limit: 10 });
    return { total: 26, users: [{ id: 'fixture', username: '<script>fixture</script>', firstName: 'Anna',
      lastName: 'Kowalska', email: 'anna@example.invalid', enabled: false, emailVerified: false }] };
  };
  for (const locale of ['pl', 'en']) {
    const html = await content(locale, { search: 'Anna & Jan', limit: '10' });
    assert.match(html, /<table/);
    assert.match(html, /scope="col"/);
    assert.match(html, /Anna Kowalska/);
    assert.match(html, /&lt;script&gt;fixture&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>fixture/);
    assert.match(html, new RegExp(`/${locale}/admin/users\\?page=2&amp;limit=10&amp;search=Anna`));
    assert.match(html, /aria-current="page"/);
    assert.match(html, /name="page"/);
    assert.match(html, locale === 'pl' ? />Akcje<\/th>/ : />Actions<\/th>/);
    assert.match(html, locale === 'pl' ? /Szczegóły użytkownika &lt;script/ : /Details for &lt;script/);
    assert.ok(html.indexOf('users-search') < html.indexOf('<table'));
    assert.match(html, /name="limit"/);
    assert.match(html, locale === 'pl' ? /Odśwież tabelę/ : /Refresh table/);
    assert.match(html, locale === 'pl' ? /Wyłączone/ : /Disabled/);
  }
});

test('users page distinguishes no results, out-of-range pages and provider failures without leaking details', async () => {
  state.authorize = async () => {};
  state.list = async () => ({ users: [], total: 0 });
  const empty = await content('en', { search: 'missing' });
  assert.match(empty, /No users match your search/);
  assert.match(empty, /disabled="" aria-label="Next"/);
  assert.match(empty, /Rows per page/);
  assert.match(await content('en', { page: '2' }), /This page has no users/);
  state.list = async () => { throw new Error('private-provider-response'); };
  const html = await content();
  assert.match(html, /Loading data/);
  assert.doesNotMatch(html, /private-provider-response|No users yet/);
});

test('users page sorts visible rows and keeps active filters in paginator links', async () => {
  state.authorize = async () => {};
  state.list = async query => {
    assert.deepEqual(query, { page: 1, search: '', limit: 10, enabled: false, emailVerified: false, sort: 'username', direction: 'desc' });
    return { total: 20, users: ['alpha', 'zulu'].map(username => ({
      id: username, username, enabled: false, emailVerified: false,
    })) };
  };
  const html = await content('en', { limit: '10', enabled: 'false', emailVerified: 'false', sort: 'username', direction: 'desc' });
  assert.match(html, /aria-sort="descending"/);
  assert.ok(html.indexOf('>zulu</td>') < html.indexOf('>alpha</td>'));
  assert.match(html, /page=2&amp;limit=10&amp;enabled=false&amp;emailVerified=false&amp;sort=username&amp;direction=desc/);
  assert.match(html, /aria-label="Filters" aria-controls="[^"]+" aria-expanded="false"/);
});
