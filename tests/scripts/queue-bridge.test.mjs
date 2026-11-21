import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { startQueueBridge } from '../../scripts/lib/queue-bridge.mjs';

async function fixture(t) {
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const id = randomUUID(); const actor = randomUUID(); const calls = [];
  const queue = {
    workerHealthy: async () => true,
    enqueueDiagnostic: async (...args) => { calls.push(args); return id; },
    list: async () => ({ jobs: [{ id, state: 'completed', executor: 'python', retryCount: 1, actorUuid: actor }] }),
  };
  const token = 'test-'.repeat(10);
  const bridge = await startQueueBridge({ queue, systemActor: async () => actor, reportOcrProgress: (...args) => calls.push(args), env: { PYWORKER_QUEUE_BRIDGE_PORT: String(port), PYWORKER_QUEUE_TOKEN: token } });
  t.after(() => bridge.close());
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  return { queue, calls, id, actor, headers, url: `http://127.0.0.1:${port}` };
}

test('queue bridge is opt-in and rejects incomplete configuration', async () => {
  assert.equal(await startQueueBridge({ env: {} }), undefined);
  await assert.rejects(startQueueBridge({ env: { PYWORKER_QUEUE_BRIDGE_PORT: '8011' } }), /Configure/);
  await assert.rejects(startQueueBridge({ env: { PYWORKER_QUEUE_BRIDGE_PORT: '8011', PYWORKER_QUEUE_TOKEN: 'demosecret'.repeat(4) } }), /Configure/);
});

test('queue bridge authenticates, enqueues as SYSTEM and returns narrow job status', async t => {
  const { url, headers, calls, actor, id } = await fixture(t);
  assert.equal((await fetch(url + '/health/ready')).status, 401);
  assert.equal((await fetch(url + '/health/ready', { headers })).status, 200);
  const response = await fetch(url + '/v1/queue/diagnostics', { headers, method: 'POST', body: JSON.stringify({ executor: 'python', failures: 1 }) });
  assert.equal(response.status, 201); assert.deepEqual(await response.json(), { id });
  assert.deepEqual(calls, [[1, actor, 'python']]);
  const job = await fetch(url + '/v1/queue/jobs/' + id, { headers });
  assert.deepEqual(await job.json(), { id, state: 'completed', executor: 'python', attempt: 1 });
  assert.equal(job.headers.get('cache-control'), 'no-store');
});

test('queue bridge rejects unbounded input, actor spoofing and hides backend errors', async t => {
  const { url, headers, calls, queue } = await fixture(t);
  for (const body of ['null', '[]', '{', JSON.stringify({ executor: 'python', failures: 0, actorUuid: randomUUID() }), JSON.stringify({ executor: 'python', failures: true })]) {
    assert.equal((await fetch(url + '/v1/queue/diagnostics', { method: 'POST', headers, body })).status, 422);
  }
  assert.equal((await fetch(url + '/v1/queue/diagnostics', { method: 'POST', headers, body: 'x'.repeat(2048) })).status, 413);
  assert.deepEqual(calls, []);
  queue.enqueueDiagnostic = async () => { throw new Error('private-credential'); };
  const failed = await fetch(url + '/v1/queue/diagnostics', { method: 'POST', headers, body: JSON.stringify({ executor: 'python', failures: 0 }) });
  assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes('private-credential'));
});

test('only authenticated progress from 0 to 99 reaches the OCR writer', async t => {
  const { url, id, headers, calls } = await fixture(t);
  const report = (body, headersOverride = headers) => fetch(url + '/v1/queue/documents/' + id + '/progress', {
    method: 'POST', headers: headersOverride, body: JSON.stringify(body),
  });
  assert.equal((await report({ percent: 25 }, {})).status, 401);
  for (const percent of [-1, 100, 0.5, '50']) assert.equal((await report({ percent })).status, 422);
  assert.equal((await report({ percent: 25 })).status, 200);
  assert.deepEqual(calls, [[id, 25]]);
});
