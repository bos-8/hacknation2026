import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryBackoff, QueueBackoffError } from '../../packages/queue/dist/query-backoff.js';

test('three failed queries activate bounded exponential cooldown and skip physical database requests', async () => {
  let time = 0, queries = 0;
  const delays = [];
  const failure = new Error('private database error');
  const gate = new QueryBackoff({ now: () => time, onDelay: (count, delay) => delays.push([count, delay]) });
  const query = () => gate.execute('fetch-jobs', async () => { queries++; throw failure; });
  for (let index = 0; index < 3; index++) await assert.rejects(query(), error => error === failure);
  assert.equal(queries, 3);
  for (const delay of [5000, 10000, 20000, 40000, 60000, 60000]) {
    for (let attempt = 0; attempt < 10; attempt++) await assert.rejects(query(), QueueBackoffError);
    const before = queries;
    time += delay - 1;
    await assert.rejects(query(), QueueBackoffError);
    assert.equal(queries, before);
    time++;
    await assert.rejects(query(), error => error === failure);
    assert.equal(queries, before + 1);
  }
  assert.deepEqual(delays.map(([, delay]) => delay), [5000, 10000, 20000, 40000, 60000, 60000, 60000]);
});

test('successful probe resets failures while healthy statements do not reset another statement cooldown', async () => {
  let time = 0, recovered = 0, queries = 0;
  const gate = new QueryBackoff({ now: () => time, onRecovery: () => recovered++ });
  const fail = () => gate.execute('poll', async () => { queries++; throw Error('unavailable'); });
  for (let index = 0; index < 3; index++) await assert.rejects(fail());
  assert.equal(await gate.execute('heartbeat', async () => 1), 1);
  await assert.rejects(fail(), QueueBackoffError);
  assert.equal(queries, 3);
  time = 5000;
  assert.equal(await gate.execute('poll', async () => 'healthy'), 'healthy');
  assert.equal(recovered, 1);
  for (let index = 0; index < 3; index++) await assert.rejects(fail(), error => !(error instanceof QueueBackoffError));
  await assert.rejects(fail(), QueueBackoffError);
  assert.equal(queries, 6);
});

test('only one probe reaches the database after cooldown and other callers fail fast', async () => {
  let time = 0;
  const gate = new QueryBackoff({ now: () => time });
  for (let index = 0; index < 3; index++) await assert.rejects(gate.execute('poll', async () => { throw Error('unavailable'); }));
  time = 5000;
  let release;
  const probe = gate.execute('poll', () => new Promise(resolve => { release = resolve; }));
  await assert.rejects(gate.execute('poll', async () => { throw Error('Must not reach database'); }), QueueBackoffError);
  release('healthy');
  assert.equal(await probe, 'healthy');
  assert.equal(await gate.execute('poll', async () => 'normal'), 'normal');
});

test('a success before the threshold resets the consecutive error counter', async () => {
  const gate = new QueryBackoff();
  const fail = () => gate.execute('poll', async () => { throw Error('unavailable'); });
  for (let cycle = 0; cycle < 4; cycle++) {
    await assert.rejects(fail()); await assert.rejects(fail());
    assert.equal(await gate.execute('poll', async () => true), true);
  }
});
