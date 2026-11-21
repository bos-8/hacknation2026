import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const ts = require('typescript');
const { createElement: h } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { NextIntlClientProvider } = require('next-intl');
const root = new URL('../../apps/web/src/', import.meta.url);
const state = globalThis.__fileActionsTest = {};
const nextImageModule = pathToFileURL(require.resolve('next/image')).href;
const mocks = new Map([
  ['server-only', ''],
  ['database.ts', 'export const getDatabase = () => globalThis.__fileActionsTest.database;'],
  ['create-product.ts', 'export const normalizeProductImage = async bytes => bytes;'],
  ['files.ts', 'export const getFileStore = () => ({remove: key => globalThis.__fileActionsTest.remove(key)}); export const getFilesConfig = () => ({}); export const listFilePage = async () => ({});'],
  ['@/server/auth/admin-access', 'export const getAdminAccess = async () => globalThis.__fileActionsTest.access;'],
  ['@/server/auth/session', 'export const getSession = async () => globalThis.__fileActionsTest.session;'],
  ['@/server/auth/admin-action', 'export const withAdminSession = async action => globalThis.__fileActionsTest.access === "allowed" && globalThis.__fileActionsTest.session ? action(globalThis.__fileActionsTest.session.user.id) : {status:"denied"};'],
  ['@/ui/components/notification-provider', 'export const useNotifications = () => ({pushNotification: () => "fixture"});'],
  ['@/ui/components/aside', 'export const PushAside = () => null;'],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/image') return nextResolve(nextImageModule, context);
    const mock = mocks.has(specifier) ? specifier : context.parentURL === new URL('server/file-catalog.ts', root).href ? specifier.replace('./', '') : null;
    if (mocks.has(mock)) return { url: `data:text/javascript,${encodeURIComponent(mocks.get(mock))}`, shortCircuit: true };
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
      compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
      fileName: fileURLToPath(url),
    }).outputText };
  },
});

const { permanentlyDeleteFile, readFilePreview } = await import('../../apps/web/src/app/[locale]/admin/files/actions.ts');
const { FilesTableBody } = await import('../../apps/web/src/app/[locale]/admin/files/files-table-body.tsx');
const uuid = '019a75c0-0000-7000-8000-000000000001';
const actor = '019a75c0-0000-7000-8000-000000000002';
const keys = ['019a75c0-0000-7000-8000-000000000003', '019a75c0-0000-7000-8000-000000000004'];
const input = { uuid, expectedStatus: 'active' };

function fixture({ conflict = false, failKey, inUse = false } = {}) {
  const events = [];
  let deleting_at = null;
  const transaction = {
    $executeRaw: async (_sql, value) => { assert.equal(value, actor); return 1; },
    $queryRaw: async (sql, ...parameters) => {
      assert.match(sql.join('?'), /FOR UPDATE/);
      assert.deepEqual(parameters, sql.join('?').includes('SELECT deleting_at') ? [uuid, 'active'] : [uuid]);
      events.push('lock');
      return conflict ? [] : [{ uuid, deleting_at }];
    },
    product: { findFirst: async args => {
      assert.deepEqual(args, { where: { imageFileUuid: uuid }, select: { uuid: true } });
      return inUse ? { uuid: actor } : null;
    } },
    file: {
      update: async ({ data }) => { deleting_at = data.deletingAt; events.push('intent'); },
      delete: async args => { assert.deepEqual(args, { where: { uuid } }); events.push('file'); },
    },
    fileVersion: {
      findMany: async args => { assert.deepEqual(args, { where: { fileUuid: uuid }, select: { seaweedUuid: true } }); return keys.map(seaweedUuid => ({ seaweedUuid })); },
      deleteMany: async args => { assert.deepEqual(args, { where: { fileUuid: uuid } }); events.push('versions'); },
    },
  };
  state.database = { $transaction: async callback => {
    try { const result = await callback(transaction); events.push('commit'); return result; }
    catch (error) { events.push('rollback'); throw error; }
  } };
  state.access = 'allowed';
  state.session = { user: { id: actor } };
  state.remove = async key => { events.push(key); if (key === failKey) throw new Error('storage offline'); };
  return events;
}

test('permanent deletion removes every stored revision before deleting catalog references', async () => {
  const events = fixture();
  assert.deepEqual(await permanentlyDeleteFile(input), { status: 'ok' });
  assert.deepEqual(events, ['lock', 'intent', 'commit', ...keys, 'lock', 'versions', 'file', 'commit']);
});

test('permanent deletion rejects unauthorized, expired and invalid requests before touching storage', async () => {
  const events = fixture();
  state.access = 'forbidden';
  assert.deepEqual(await permanentlyDeleteFile(input), { status: 'denied' });
  state.access = 'allowed'; state.session = null;
  assert.deepEqual(await permanentlyDeleteFile(input), { status: 'denied' });
  state.session = { user: { id: actor } };
  assert.deepEqual(await permanentlyDeleteFile({ ...input, uuid: 'invalid' }), { status: 'invalid' });
  assert.deepEqual(await permanentlyDeleteFile({ ...input, expectedStatus: 'perma_delete' }), { status: 'invalid' });
  assert.deepEqual(events, []);
});

test('a stale or missing file prevents permanent deletion of any revision', async () => {
  const events = fixture({ conflict: true });
  assert.deepEqual(await permanentlyDeleteFile(input), { status: 'conflict' });
  assert.deepEqual(events, ['lock', 'commit']);
});

test('a product image cannot be removed from storage or the catalog while referenced', async () => {
  const events = fixture({ inUse: true });
  assert.deepEqual(await permanentlyDeleteFile(input), { status: 'inUse' });
  assert.deepEqual(events, ['lock', 'commit']);
});

test('a partial storage failure preserves catalog references and permits an idempotent retry', async () => {
  const events = fixture({ failKey: keys[1] });
  assert.deepEqual(await permanentlyDeleteFile(input), { status: 'failed' });
  assert.deepEqual(events, ['lock', 'intent', 'commit', ...keys]);
  state.remove = async key => events.push(key);
  assert.deepEqual(await permanentlyDeleteFile(input), { status: 'ok' });
  assert.deepEqual(events.slice(5), ['lock', 'commit', ...keys, 'lock', 'versions', 'file', 'commit']);
});

function rowMarkup(locale, status, disabled = false, processing) {
  const messages = JSON.parse(readFileSync(new URL(`../../apps/web/messages/${locale}/common.json`, import.meta.url), 'utf8'));
  const row = { key: keys[0], name: 'fixture.pdf', size: 8, version: 1, latestVersion: 2, processing, modifiedAt: new Date('2026-11-11T12:00:00Z'),
    details: status ? { uuid, status, tags: [], createdAt: new Date(), updatedAt: new Date(), createdByUuid: actor, updatedByUuid: actor } : undefined };
  return renderToStaticMarkup(h(NextIntlClientProvider, { locale, messages, timeZone: 'Europe/Warsaw' },
    h('table', null, h(FilesTableBody, { rows: [row], ocr: !!processing, disabled, onChanged() {} }))));
}

function buttons(locale, status, disabled) {
  const html = rowMarkup(locale, status, disabled);
  return [...html.matchAll(/<button\b[^>]*>/g)].map(match => match[0]);
}

test('each current status action is natively disabled; pending deletion and permanent deletion are separate buttons in PL/EN', () => {
  const statuses = ['active', 'inactive', 'pending_archiving', 'pending_deletion'];
  for (const locale of ['pl', 'en']) for (const [index, status] of statuses.entries()) {
    const actions = buttons(locale, status);
    assert.equal(actions.length, 7);
    actions.slice(0, 4).forEach((button, target) => assert.equal(button.includes('disabled=""'), index === target, `${locale}: ${status} -> ${statuses[target]}`));
    assert.equal(actions[4].includes('disabled=""'), false);
    assert.match(actions[4], /aria-haspopup="dialog"/);
    assert.equal(actions[5].includes('disabled=""'), index >= 2);
  }
});

test('uncatalogued files and a refreshing table disable every mutation button', () => {
  for (const actions of [buttons('en'), buttons('en', 'active', true)]) {
    assert.ok(actions.slice(0, 5).every(button => button.includes('disabled=""')));
    assert.equal(actions.at(-1).includes('disabled=""'), false);
  }
});

test('file preview authorizes before reads and resolves a logical file independently of table pagination', async () => {
  fixture();
  const reads = [];
  const date = new Date('2026-11-12T12:00:00Z');
  const record = { uuid, name: 'photo.webp', status: 'active', createdAt: date, updatedAt: date,
    createdByUuid: actor, updatedByUuid: actor, tags: [{ tag: { name: 'photo' } }],
    versions: [{ seaweedUuid: keys[0], version: 2, size: BigInt(50), createdAt: date }] };
  state.database.file = { findUnique: async args => { reads.push(args); return record; } };
  state.access = 'forbidden';
  assert.deepEqual(await readFilePreview(uuid), { status: 'denied' });
  assert.equal(reads.length, 0);
  state.access = 'allowed';
  assert.deepEqual(await readFilePreview('../key'), { status: 'notFound' });
  assert.equal(reads.length, 0);
  const result = await readFilePreview(uuid);
  assert.equal(result.status, 'ok');
  assert.deepEqual(reads[0].where, { uuid });
  assert.deepEqual(reads[0].select.versions.orderBy, { version: 'desc' });
  assert.equal(reads[0].select.versions.take, 1);
  assert.equal(result.file.key, keys[0]);
  assert.equal(result.file.details.uuid, uuid);
  assert.deepEqual(result.file.details.tags, ['photo']);
  state.database.file.findUnique = async () => null;
  assert.deepEqual(await readFilePreview(uuid), { status: 'notFound' });
  state.database.file.findUnique = async () => { throw new Error('Private DB details'); };
  assert.deepEqual(await readFilePreview(uuid), { status: 'failed' });
});

test('OCR rows show measured page progress, terminal states and restore on historical revisions', () => {
  const timing = { queuedAt: new Date(2000), startedAt: new Date(4000), sampledAt: new Date(10000), estimateMs: null };
  const running = rowMarkup('en', 'active', false, { state: 'ocrRunning', percent: 50, timing });
  assert.match(running, /role="progressbar"[^>]*aria-label="OCR in progress"[^>]*aria-valuenow="50"/);
  assert.match(running, /width:50%/);
  assert.match(running, /Elapsed 6 s/);
  assert.match(running, /About 6 s left/);
  const queued = rowMarkup('en', 'active', false, { state: 'ocrQueued', timing: { ...timing, startedAt: null, sampledAt: null } });
  assert.match(queued, /role="progressbar"[^>]*aria-label="Queued"/);
  assert.ok(!queued.includes('aria-valuenow'));
  assert.match(running, /aria-label="Restore version"/);
  for (const [state, label] of [['ocrNone', 'OCR not started'], ['ocrDone', 'OCR complete'], ['ocrFailed', 'OCR failed']]) {
    const html = rowMarkup('en', 'active', false, { state });
    assert.ok(html.includes(label));
    assert.ok(!html.includes('role="progressbar"'));
  }
});
