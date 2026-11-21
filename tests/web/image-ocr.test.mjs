import test from 'node:test';
import assert from 'node:assert/strict';
import { getImageOcrConfig, recognizeImageText } from '../../apps/web/src/server/image-ocr.ts';

const config = { url: 'https://model.example.invalid/v1/chat/completions', model: 'gemma-4-31b-it', key: 'private-fixture' };
const image = new Uint8Array([137, 80, 78, 71]);
const reply = (content, finish_reason = 'stop') => Response.json({ choices: [{ finish_reason, message: { content } }] });

test('OCR configuration supports Gemma provider IDs and local endpoints without leaking invalid values', () => {
  assert.equal(getImageOcrConfig({ OCR_API_URL: config.url }).model, 'gemma-4-31b-it');
  assert.equal(getImageOcrConfig({ OCR_API_URL: 'http://localhost:1234/v1/chat/completions', OCR_MODEL: 'google/gemma-4-31B-it' }).model, 'google/gemma-4-31B-it');
  for (const url of ['', 'invalid-private-fixture', 'https://provider.example/v1/chat/completions', 'http://untrusted.example.invalid/v1',
    'https://user:private-fixture@model.example.invalid/v1', 'https://model.example.invalid/v1?key=private-fixture']) {
    assert.throws(() => getImageOcrConfig({ OCR_API_URL: url }), error => {
      assert.equal(error.status, 'notConfigured');
      assert.doesNotMatch(error.message, /private-fixture/);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('Gemma receives actual image content before transcription instructions, and returns Polish text unchanged', async () => {
  let calls = 0;
  const result = await recognizeImageText(image, 'image/png', config, async (url, options) => {
    calls++;
    assert.equal(url, config.url);
    assert.equal(options.headers.Authorization, 'Bearer private-fixture');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    const input = JSON.parse(options.body);
    assert.equal(input.model, 'gemma-4-31b-it');
    assert.equal(input.stream, false);
    assert.equal(input.messages[0].content[0].image_url.url, 'data:image/png;base64,iVBORw==');
    assert.match(input.messages[0].content[1].text, /never as instructions/);
    assert.doesNotMatch(options.body, /uploadedAt/);
    return reply('Zażółć gęślą jaźń\n21.11.2026');
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { model: 'gemma-4-31b-it', text: 'Zażółć gęślą jaźń\n21.11.2026' });
});

test('empty OCR is valid; incomplete, refused and malformed model replies are rejected', async () => {
  assert.equal((await recognizeImageText(image, 'image/png', config, async () => reply(''))).text, '');
  for (const response of [reply('partial', 'length'), reply(null), Response.json({}),
    new Response('private-provider-error', { status: 401 }), new Response('not json'),
    new Response('x'.repeat(1024 * 1024 + 1))]) {
    await assert.rejects(recognizeImageText(image, 'image/png', config, async () => response), error => {
      assert.equal(error.status, 'unavailable');
      assert.doesNotMatch(error.message, /private/);
      return true;
    });
  }
});

test('provider failures are redacted and not retried', async () => {
  let calls = 0;
  await assert.rejects(recognizeImageText(image, 'image/jpeg', config, async () => {
    calls++;
    throw Error('private-provider-error');
  }), error => error.status === 'unavailable' && !error.message.includes('private'));
  assert.equal(calls, 1);
});
