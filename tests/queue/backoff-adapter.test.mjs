import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const state = globalThis.__queueBackoffTest = {};
registerHooks({ resolve(specifier, context, nextResolve) {
  const source = specifier === 'pg-boss' ? `
    import {EventEmitter} from 'node:events';
    export class PgBoss extends EventEmitter {
      constructor() { super(); this.adapter={executeSql:(...args)=>globalThis.__queueBackoffTest.query(...args)};globalThis.__queueBackoffTest.boss=this; }
      getDb(){return this.adapter;} async start(){} async stop(){}
      async createQueue(...args){globalThis.__queueBackoffTest.created.push(args);}
      async updateQueue(...args){globalThis.__queueBackoffTest.updated.push(args);}
    }` : specifier === 'pg' ? 'export class Pool {on(){} async end(){} async query(sql){return {rows:sql.includes("GROUP BY state")?(globalThis.__queueBackoffTest.summaryRows??[]):[]};}}' : null;
  return source ? { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true } : nextResolve(specifier, context);
} });
const { JobQueue } = await import('../../packages/queue/dist/index.js');
const { QueueBackoffError } = await import('../../packages/queue/dist/query-backoff.js');

test('queue dashboard summary separates Python states and retains exact large counts', async () => {
  state.summaryRows = [{ state: 'completed', total: '9007199254740993', python: '2' }, { state: 'active', total: '3', python: '1' }];
  const queue = new JobQueue('postgresql://fixture:private-password@localhost/fixture');
  const summary = await queue.summary();
  assert.equal(summary.all.total, '9007199254740996');
  assert.equal(summary.all.active, '3');
  assert.equal(summary.all.created, '0');
  assert.equal(summary.python.total, '3');
  assert.equal(summary.python.active, '1');
  assert.equal(summary.python.completed, '2');
  await queue.stop();
  state.summaryRows = [];
});

test('schema preparation preserves an existing queue policy while explicit setup retains policy reconciliation', async () => {
  for (const preserveQueuePolicy of [true, false]) {
    state.created = []; state.updated = [];
    const queue = new JobQueue('postgresql://fixture:private-password@localhost/fixture', { migrate: true, preserveQueuePolicy });
    await queue.start();
    assert.deepEqual(state.created.map(([name]) => name).sort(), ['form.process', 'system.check']);
    assert.deepEqual(state.updated.map(([name]) => name), preserveQueuePolicy ? [] : ['system.check']);
    await queue.stop();
  }
});

test('JobQueue throttles its actual pg-boss adapter and omits suppressed errors and private details from logs', async t => {
  let now = 0, queries = 0, healthy = false;
  const messages = [];
  t.mock.method(Date, 'now', () => now);
  t.mock.method(console, 'error', message => messages.push(message));
  t.mock.method(console, 'log', message => messages.push(message));
  state.query = async () => {
    queries++;
    if (!healthy) throw Object.assign(new Error('private password and SQL'), { code: '42P01' });
    return { rows: [{ checked: true }] };
  };
  const queue = new JobQueue('postgresql://fixture:private-password@localhost/fixture');
  const poll = async () => {
    try { return await state.boss.getDb().executeSql('private statement', ['private parameter']); }
    catch (error) { state.boss.emit('error', error); return error; }
  };
  for (let attempt = 0; attempt < 3; attempt++) await poll();
  for (let attempt = 0; attempt < 20; attempt++) assert.ok(await poll() instanceof QueueBackoffError);
  assert.equal(queries, 3, 'Cooldown must skip real adapter calls');
  assert.equal(messages.filter(message => message.startsWith('Queue processing operation failed')).length, 3);
  assert.equal(messages.filter(message => message.includes('next attempt in 5s')).length, 1);
  assert.ok(messages.some(message => message.includes('42P01')));
  assert.ok(messages.every(message => !message.includes('private')));
  now = 5000; healthy = true;
  assert.deepEqual(await poll(), { rows: [{ checked: true }] });
  assert.deepEqual(await poll(), { rows: [{ checked: true }] });
  assert.equal(queries, 5);
  assert.equal(messages.filter(message => message.includes('normal polling restored')).length, 1);
  await queue.stop();
});
