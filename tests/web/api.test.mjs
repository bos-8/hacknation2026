import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveness, getReadiness } from '../../apps/web/src/server/health.ts';
import { jsonNoStore } from '../../apps/web/src/server/http.ts';
import { API_ROUTES } from '../../apps/web/src/config/api-routes.ts';
import { readOpenAiReply, streamOpenAiChat } from '../../apps/web/src/server/openai-chat.ts';

function providerStream(events) {
  const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''));
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 3) controller.enqueue(bytes.subarray(offset, offset + 3));
      controller.close();
    },
  });
}

test('chat streams reasoning and Unicode text, with an active prompt and file input', async t => {
  assert.equal(API_ROUTES.chat, '/api/v1/chat');
  const deltas = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.headers.Authorization, 'Bearer test-key');
    const payload = JSON.parse(init.body);
    assert.deepEqual(payload.reasoning, { effort: 'medium', summary: 'auto' });
    assert.equal(payload.instructions, 'Test instructions');
    assert.equal(payload.store, false);
    assert.equal(payload.stream, true);
    assert.deepEqual(payload.input, [
      { role: 'assistant', content: 'Earlier answer' },
      { role: 'user', content: [
        { type: 'input_text', text: 'Summarize the attachment' },
        { type: 'input_file', filename: 'notes.txt', file_data: 'data:text/plain;base64,YQ==' },
      ] },
    ]);
    return new Response(providerStream([
      { type: 'response.reasoning_summary_text.delta', delta: 'Plan' },
      { type: 'response.output_text.delta', delta: 'Zażółć' },
      { type: 'response.output_text.delta', delta: ' gęślą' },
      { type: 'response.completed', response: {
        id: 'resp_test', model: 'test-model-snapshot', service_tier: 'default',
        usage: { input_tokens: 40, output_tokens: 20, total_tokens: 60,
          input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 12 } },
      } },
    ]));
  });
  const { content, generation } = await streamOpenAiChat({
    key: 'test-key', model: 'test-model', mode: 'thinking', instructions: 'Test instructions', promptVersion: 3,
    context: [
      { role: 'assistant', content: 'Earlier answer', attachments: [] },
      { role: 'user', content: 'Summarize the attachment', attachments: [{ name: 'notes.txt', content: Uint8Array.of(97) }] },
    ],
    signal: AbortSignal.timeout(2000), onDelta: (...delta) => deltas.push(delta),
  });
  assert.deepEqual(deltas, [['summary', 'Plan'], ['text', 'Zażółć'], ['text', ' gęślą']]);
  assert.equal(content, 'Zażółć gęślą');
  const { firstTextMs, totalMs, ...metadata } = generation;
  assert.ok(firstTextMs >= 0 && totalMs >= firstTextMs);
  assert.deepEqual(metadata, {
    model: 'test-model-snapshot', requestedModel: 'test-model', responseId: 'resp_test', serviceTier: 'default',
    promptVersion: 3, effort: 'medium', summaryMode: 'auto', outputLimit: 8192,
    usage: { input: 40, output: 20, total: 60, cached: 0, cacheWrite: null, reasoning: 12 },
  });
});

test('chat does not treat a disconnected or incomplete stream as a finished reply', async () => {
  const partial = { type: 'response.output_text.delta', delta: 'Partial' };
  for (const events of [[partial], [partial, { type: 'response.incomplete' }]]) {
    await assert.rejects(readOpenAiReply(providerStream(events), () => {}), { status: 'incomplete' });
  }
});

test('session clients share the auth API namespace and current endpoint contracts', () => {
  assert.deepEqual(API_ROUTES.session, {
    status: `${API_ROUTES.auth}/session-status`, renew: `${API_ROUTES.auth}/renew-session`,
    logout: `${API_ROUTES.auth}/hard-sign-out`,
  });
});

test('liveness reports only process availability', () => {
  assert.deepEqual(getLiveness(), { status: 'ok', service: 'web', check: 'liveness' });
});

test('readiness validates configuration and exposes only the public check result', () => {
  const result = getReadiness({ PORT: '3000', TZ: 'Europe/Warsaw', AUTH_SECRET: 'private-fixture' });
  assert.deepEqual(result, {
    status: 'ok', service: 'web', check: 'readiness', checks: { configuration: 'up' },
  });
});

test('invalid readiness is a noncached 503 without invalid values or secret fields', async () => {
  for (const invalid of [{ PORT: 'private-fixture' }, { TZ: 'private-fixture' }, { APP_NAME: '' }]) {
    const result = getReadiness({ ...invalid, AUTH_SECRET: 'private-fixture' });
    const response = jsonNoStore(result, result.status === 'ok' ? 200 : 503);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await response.json(), {
      status: 'error', service: 'web', check: 'readiness', checks: { configuration: 'down' },
    });
  }
});
