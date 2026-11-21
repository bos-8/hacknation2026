import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const sharp = require('sharp');
const root = new URL('../../apps/web/src/', import.meta.url);
const state = globalThis.__imageOcrTest = {};
const mocks = {
  '@/server/auth/admin-action': 'export const withAdminSession = async action => globalThis.__imageOcrTest.allowed ? action("fixture-actor") : {status:"denied"};',
  '@/server/database': 'export const getDatabase = () => ({ fileVersion: { findFirst: input => globalThis.__imageOcrTest.find(input) } });',
  '@/server/files': 'export const getFileStore = () => ({ get: () => globalThis.__imageOcrTest.bytes });',
  '@/server/image-ocr': 'export {ImageOcrProviderError} from "' + new URL('server/image-ocr.ts', root).href + '"; export const getImageOcrConfig = () => ({}); export const recognizeImageText = (...args) => globalThis.__imageOcrTest.recognize(...args);',
};
registerHooks({ resolve(specifier, context, next) {
  if (Object.hasOwn(mocks, specifier)) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const url = new URL(specifier.slice(2) + '.ts', root);
    if (existsSync(fileURLToPath(url))) return next(url.href, context);
  }
  return next(specifier, context);
} });
const { recognizePhoto } = await import('../../apps/web/src/app/[locale]/admin/files/ocr/image-actions.ts');
const uuid = '019a75c0-0000-7000-8000-000000000001';
const uploadedAt = new Date('2026-11-20T12:34:56.000Z');

async function fixture() {
  state.allowed = true;
  state.bytes = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#ffffff' } }).png().toBuffer();
  state.source = { size: BigInt(state.bytes.length), seaweedUuid: uuid, createdAt: uploadedAt, fileName: 'photo.png', file: { name: 'photo.png' } };
  state.find = async input => {
    assert.deepEqual(input.where, { fileUuid: uuid, version: 2, file: { deletingAt: null } });
    return state.source;
  };
  state.calls = 0;
  state.recognize = async (bytes, type) => {
    state.calls++;
    assert.equal(type, 'image/png');
    assert.equal((await sharp(bytes).metadata()).format, 'png');
    return { text: 'Data na zdjęciu: 1999-01-01', model: 'gemma-4-31b-it' };
  };
}

test('OCR authenticates before catalog or storage access and validates version input', async () => {
  await fixture();
  state.allowed = false;
  state.find = () => assert.fail('Unauthorized catalog access');
  assert.deepEqual(await recognizePhoto(uuid, 2), { status: 'denied' });
  state.allowed = true;
  for (const args of [['not-a-uuid', 2], [uuid, 0], [uuid, 1.5]]) {
    assert.deepEqual(await recognizePhoto(...args), { status: 'invalid' });
  }
  assert.equal(state.calls, 0);
});

test('upload timestamp comes from the selected catalog revision, independently of model text', async () => {
  await fixture();
  const result = await recognizePhoto(uuid, 2);
  assert.deepEqual(result, { status: 'ok', text: 'Data na zdjęciu: 1999-01-01', model: 'gemma-4-31b-it', uploadedAt: uploadedAt.toISOString() });
  assert.equal(state.calls, 1);
});

test('missing, oversized, mismatched and corrupt files never reach the provider', async () => {
  for (const kind of ['missing', 'oversized', 'mismatch', 'corrupt', 'pdf']) {
    await fixture();
    if (kind === 'missing') state.source = null;
    if (kind === 'oversized') state.source.size = BigInt(9 * 1024 * 1024);
    if (kind === 'mismatch') state.source.size++;
    if (kind === 'corrupt') { state.bytes = Buffer.from('not an image'); state.source.size = BigInt(state.bytes.length); }
    if (kind === 'pdf') state.source.fileName = 'document.pdf';
    assert.deepEqual(await recognizePhoto(uuid, 2), { status: 'invalid' });
    assert.equal(state.calls, 0);
  }
});

test('concurrent OCR for the same actor is bounded and a failed call releases the slot', async () => {
  await fixture();
  let finish, entered;
  const started = new Promise(resolve => { entered = resolve; });
  state.recognize = () => { entered(); return new Promise(resolve => { finish = resolve; }); };
  const first = recognizePhoto(uuid, 2);
  await started;
  assert.deepEqual(await recognizePhoto(uuid, 2), { status: 'busy' });
  finish({ text: '', model: 'gemma-4-31b-it' });
  assert.equal((await first).status, 'ok');
  state.recognize = () => { throw Error('private-provider-error'); };
  assert.deepEqual(await recognizePhoto(uuid, 2), { status: 'unavailable' });
  state.recognize = async () => ({ text: 'OK', model: 'gemma-4-31b-it' });
  assert.equal((await recognizePhoto(uuid, 2)).status, 'ok');
});
