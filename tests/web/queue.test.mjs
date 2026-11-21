import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { parseQueueQuery, queueQuerySchema } from '../../apps/web/src/schemas/queue.ts';

const state = globalThis.__queueWebTest = {};
const root = new URL('../../apps/web/src/', import.meta.url);
registerHooks({ resolve(specifier, context, nextResolve) {
  const sources = {
    '@/server/auth/admin-action': 'export const withAdminSession = async action => globalThis.__queueWebTest.allowed ? action("019a75c0-0000-7000-8000-000000000002") : {status:"denied"};',
    '@/server/queue': 'export const getJobQueue = () => globalThis.__queueWebTest.queue;',
    '@/server/database': 'export const getDatabase=()=>{globalThis.__queueWebTest.databaseReads++;return {};};',
    '@formiq/database': 'export const activeSystemConfig=async()=>({uuid:"019a75c0-0000-7000-8000-000000000003"});',
  };
  if (sources[specifier]) return { url: `data:text/javascript,${encodeURIComponent(sources[specifier])}`, shortCircuit: true };
  if (specifier.startsWith('@/')) return nextResolve(new URL(specifier.slice(2) + '.ts', root).href, context);
  return nextResolve(specifier, context);
} });
const { refreshQueue, testQueue, changeQueueJob } = await import('../../apps/web/src/app/[locale]/admin/queue/actions.ts');

test('queue query validation bounds paging and permits only known states', () => {
  assert.deepEqual(parseQueueQuery({ page: '2', limit: '10', search: ' check ', state: 'failed' }), { page: 2, limit: 10, search: 'check', state: 'failed' });
  assert.equal(parseQueueQuery({ page: '99999999', limit: '9999', state: 'DROP' }).page, 1);
  assert.equal(queueQuerySchema.safeParse({ page: 0 }).success, false);
  assert.equal(queueQuerySchema.safeParse({ state: 'DROP' }).success, false);
});

test('queue reads and diagnostics authorize before touching the queue', async () => {
  state.allowed = false;
  state.queue = new Proxy({}, { get() { throw new Error('Unexpected queue access'); } });
  assert.deepEqual(await refreshQueue(parseQueueQuery({})), { status: 'denied' });
  assert.deepEqual(await testQueue({ failures: 0 }), { status: 'denied' });
  assert.deepEqual(await changeQueueJob({}), { status: 'denied' });
});

test('job actions validate inputs, use the verified actor and check active configuration only for replaying monitoring jobs', async () => {
  state.allowed = true; state.databaseReads = 0; const calls = [];
  state.queue = { changeJob: async (...args) => { calls.push(args); return { status: 'ok' }; } };
  const input = { id: '019a75c0-0000-7000-8000-000000000001', name: 'system.check', operation: 'delete', expectedState: 'created', expectedRetryCount: 0, expectedAdminActionUuid: null };
  assert.deepEqual(await changeQueueJob({ ...input, id: 'invalid' }), { status: 'invalid' });
  assert.deepEqual(await changeQueueJob({ ...input, name: 'arbitrary.command' }), { status: 'invalid' });
  assert.equal(calls.length, 0);
  assert.deepEqual(await changeQueueJob({ ...input, actorUuid: 'forged' }), { status: 'ok' });
  assert.equal(calls[0][1], '019a75c0-0000-7000-8000-000000000002'); assert.equal(calls[0][2], null); assert.equal(state.databaseReads, 0);
  await changeQueueJob({ ...input, name: 'monitoring.collect', operation: 'retry', expectedState: 'failed' });
  assert.equal(state.databaseReads, 1); assert.equal(calls[1][2], '019a75c0-0000-7000-8000-000000000003');
});

test('queue diagnostic accepts bounded failure counts and uses the verified actor', async () => {
  state.allowed = true;
  const calls = [];
  state.queue = { enqueueDiagnostic: async (...args) => { calls.push(args); return 'fixture-job'; }, list: async query => ({ jobs: [], total: query.state ? 0 : 2 }) };
  for (const failures of [-1, 5, 0.5, '1']) assert.deepEqual(await testQueue({ failures }), { status: 'invalid' });
  assert.equal(calls.length, 0);
  assert.deepEqual(await testQueue({ failures: 4, actorUuid: 'forged', task: 'arbitrary-command' }), { status: 'ok', id: 'fixture-job' });
  assert.deepEqual(calls, [[4, '019a75c0-0000-7000-8000-000000000002', 'node']]);
  assert.deepEqual(await testQueue({ failures: 0, executor: 'python' }), { status: 'ok', id: 'fixture-job' });
  assert.deepEqual(calls[1], [0, '019a75c0-0000-7000-8000-000000000002', 'python']);
  assert.deepEqual(await testQueue({ failures: 0, executor: 'shell' }), { status: 'invalid' });
  assert.equal(calls.length, 2);
  assert.deepEqual(await refreshQueue(parseQueueQuery({})), { status: 'ok', page: { jobs: [], total: 2 } });
  state.queue.list = async () => { throw new Error('private connection details'); };
  assert.deepEqual(await refreshQueue(parseQueueQuery({})), { status: 'failed' });
});
