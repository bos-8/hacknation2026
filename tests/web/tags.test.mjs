import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { tagColorSchema, tagSaveSchema, tagStatusChangeSchema, tagTextColor, parseTagQuery } from '../../apps/web/src/schemas/tag.ts';

const state = globalThis.__tagsTest = {};
const root = new URL('../../apps/web/src/', import.meta.url);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL === new URL('server/tags.ts', root).href && specifier === './database.ts') return {
    url: 'data:text/javascript,export const getDatabase = () => globalThis.__tagsTest.database;', shortCircuit: true,
  };
  if (specifier === '@/server/auth/admin-action') return {
    url: 'data:text/javascript,export const withAdminSession = async action => globalThis.__tagsTest.allowed ? action(globalThis.__tagsTest.actor) : {status:"denied"};', shortCircuit: true,
  };
  if (specifier.startsWith('@/')) return nextResolve(new URL(specifier.slice(2) + '.ts', root).href, context);
  return nextResolve(specifier, context);
} });
const { loadTags, saveTag, deleteTag } = await import('../../apps/web/src/server/tags.ts');
const { refreshTags, submitTag, removeTag, changeTagStatus } = await import('../../apps/web/src/app/[locale]/admin/tags/actions.ts');
const uuid = '019a75c0-0000-7000-8000-000000000001';
const actor = '019a75c0-0000-7000-8000-000000000002';
const date = '2026-11-12T12:00:00.000Z';

test('tag validation accepts only solid HEX colors and a paired edit identity/version', () => {
  assert.equal(tagColorSchema.parse(' #abc123 '), '#ABC123');
  for (const color of ['red', '#fff', 'url(javascript:x)', '#12345678', '#12345Z', '']) assert.equal(tagColorSchema.safeParse(color).success, false);
  assert.equal(tagSaveSchema.safeParse({ name: '  Work ', color: '#112233' }).data.name, 'Work');
  assert.equal(tagSaveSchema.safeParse({ name: 'x', color: '#112233', uuid }).success, false);
  assert.equal(tagSaveSchema.safeParse({ name: 'x', color: '#112233', expectedUpdatedAt: date }).success, false);
  assert.equal(tagTextColor('#FFFFFF'), '#000000'); assert.equal(tagTextColor('#000000'), '#FFFFFF');
  assert.equal(tagTextColor('#64748B'), '#FFFFFF');
});

test('tag queries filter the complete catalog before pagination and preserve deterministic sorting', async () => {
  const calls = [];
  state.database = { tag: {
    count: async args => { calls.push(['count', args]); return 17; },
    findMany: async args => { calls.push(['list', args]); return [{ uuid, name: 'A', color: '#112233', _count: { files: 4 } }]; },
  }, $transaction: async values => Promise.all(values) };
  const result = await loadTags(parseTagQuery({ page: '2', limit: '10', search: '50%', used: 'yes', sort: 'color', direction: 'desc' }));
  const query = calls.find(([kind]) => kind === 'list')[1];
  assert.equal(query.skip, 10); assert.equal(query.take, 10);
  assert.equal(query.where.name.contains, '50\\%'); assert.deepEqual(query.where.files, { some: {} });
  assert.deepEqual(query.orderBy, [{ color: 'desc' }, { uuid: 'asc' }]);
  assert.equal(result.total, 17); assert.equal(result.tags[0].fileCount, 4);
  assert.equal(parseTagQuery({ limit: '99999', page: '-1', sort: 'DROP' }).limit, 25);
});

test('every tag action checks authorization before protected reads or writes', async () => {
  state.allowed = false;
  state.database = new Proxy({}, { get() { throw new Error('Unexpected database access'); } });
  assert.deepEqual(await refreshTags(parseTagQuery({})), { status: 'denied' });
  assert.deepEqual(await submitTag(new FormData()), { status: 'denied' });
  assert.deepEqual(await removeTag({ uuid, expectedUpdatedAt: date }), { status: 'denied' });
  assert.deepEqual(await changeTagStatus({ uuid, expectedUpdatedAt: date, expectedStatus: 'active', status: 'inactive' }), { status: 'denied' });
});

test('tag statuses reject repeated or unsupported transitions and audit conditional writes', async () => {
  const input = { uuid, expectedUpdatedAt: date, expectedStatus: 'active', status: 'inactive' };
  for (const status of ['active', 'archived', 'softdelete', 'perma_delete']) assert.equal(tagStatusChangeSchema.safeParse({ ...input, status }).success, false);
  state.allowed = true; state.actor = actor;
  let captured, count = 1;
  state.database = { tag: { updateMany: async args => { captured = args; return { count }; } } };
  assert.deepEqual(await changeTagStatus(input), { status: 'ok' });
  assert.deepEqual(captured, { where: { uuid, status: 'active', updatedAt: new Date(date) }, data: { status: 'inactive', updatedByUuid: actor } });
  count = 0;
  assert.deepEqual(await changeTagStatus(input), { status: 'conflict' });
});

test('tag writes use the verified actor, normalize color and reject stale edits and duplicate names', async () => {
  state.allowed = true; state.actor = actor;
  const calls = [];
  state.database = { tag: {
    create: async args => { calls.push(args); return { uuid }; },
    updateMany: async args => { calls.push(args); return { count: 0 }; },
  } };
  const form = new FormData();
  Object.entries({ name: '  Work ', color: '#aabbcc', createdByUuid: 'forged' }).forEach(([key, value]) => form.set(key, value));
  assert.deepEqual(await submitTag(form), { status: 'ok' });
  assert.deepEqual(calls[0].data, { name: 'Work', color: '#AABBCC', createdByUuid: actor, updatedByUuid: actor });
  form.set('uuid', uuid); form.set('expectedUpdatedAt', date);
  assert.deepEqual(await submitTag(form), { status: 'conflict' });
  assert.deepEqual(calls[1].where, { uuid, updatedAt: new Date(date) });
  state.database.tag.create = async () => { throw Object.assign(new Error('private'), { code: 'P2002' }); };
  assert.deepEqual(await saveTag({ name: 'Work', color: '#123456' }, actor), { status: 'duplicate' });
});

test('tag deletion locks the expected row, preserves assigned tags and detects concurrent updates', async () => {
  let used = 1, found = true, deleted = 0;
  state.database = { $transaction: async action => action({
    $queryRaw: async (sql, ...args) => { assert.match(sql.join('?'), /FOR UPDATE/); assert.deepEqual(args, [uuid, new Date(date)]); return found ? [{ uuid }] : []; },
    fileTag: { count: async () => used }, tag: { delete: async () => { deleted++; } },
  }) };
  assert.deepEqual(await deleteTag({ uuid, expectedUpdatedAt: date }), { status: 'inUse' });
  assert.equal(deleted, 0);
  used = 0; found = false;
  assert.deepEqual(await deleteTag({ uuid, expectedUpdatedAt: date }), { status: 'conflict' });
  found = true;
  assert.deepEqual(await deleteTag({ uuid, expectedUpdatedAt: date }), { status: 'ok' });
  assert.equal(deleted, 1);
});
