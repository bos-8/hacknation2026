import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const sharp = require('sharp');
const state = globalThis.__productImagesTest = {};
registerHooks({ resolve(specifier, context, nextResolve) {
  const owner = context.parentURL?.split('/').pop();
  if (['product-status.ts', 'product-image.ts', 'file-image.ts', 'image-response.ts', 'file-download.ts', 'create-product.ts'].includes(owner)) {
    const sources = {
      './database.ts': 'export const getDatabase = () => globalThis.__productImagesTest.database;',
      './files.ts': 'export const getFileStore = () => globalThis.__productImagesTest.storage;',
      './auth/access.ts': 'export const getAccess = async () => ({status: globalThis.__productImagesTest.access});',
    };
    if (sources[specifier]) return { url: `data:text/javascript,${encodeURIComponent(sources[specifier])}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });
const { editProduct } = await import('../../apps/web/src/server/product-status.ts');
const { productImageResponse } = await import('../../apps/web/src/server/product-image.ts');
const { fileImageResponse } = await import('../../apps/web/src/server/file-image.ts');
const { fileDownloadResponse } = await import('../../apps/web/src/server/file-download.ts');
const uuid = '019a75c0-0000-7000-8000-000000000001';
const actor = '019a75c0-0000-7000-8000-000000000002';
const fileUuid = '019a75c0-0000-7000-8000-000000000003';
const key = '019a75c0-0000-7000-8000-000000000004';
const input = { uuid, expectedUpdatedAt: '2026-11-12T12:00:00.000Z', code: 'prd-test', name: 'Lamp', description: '', price: '12,3400', currency: 'pln' };
const png = await sharp({ create: { width: 24, height: 16, channels: 4, background: '#abcdef' } }).png().toBuffer();

function editFixture({ conflict = false, storageFailure = false, lostCommit = false, committed = false, replacedAgain = false } = {}) {
  const events = [];
  const transaction = {
    product: {
      updateMany: async args => { events.push(['update', args]); return { count: conflict ? 0 : 1 }; },
      update: async args => { events.push(['attach', args]); return { uuid }; },
    },
    $queryRaw: async () => [{ uuid: key }],
    file: { create: async args => { events.push(['file', args]); return { uuid: fileUuid }; } },
  };
  state.database = {
    $transaction: async action => { const result = await action(transaction); if (lostCommit) throw new Error('Lost response'); return result; },
    fileVersion: { findUnique: async () => committed ? { uuid: key } : null },
    product: { findUnique: async () => ({ imageFileUuid: replacedAgain ? actor : fileUuid }) },
  };
  state.storage = {
    put: async (objectKey, bytes) => { events.push(['put', objectKey, await sharp(bytes).metadata()]); if (storageFailure) throw new Error('Partial write'); },
    remove: async objectKey => { events.push(['remove', objectKey]); },
  };
  return events;
}

test('editing with an image stores normalized WebP and links an audited file after the concurrency check', async () => {
  const events = editFixture();
  assert.deepEqual(await editProduct(input, actor, png), { status: 'ok', uuid });
  assert.deepEqual(events.map(([kind]) => kind), ['update', 'file', 'attach', 'put']);
  assert.equal(events[0][1].where.updatedAt.toISOString(), input.expectedUpdatedAt);
  assert.equal(events[1][1].data.createdByUuid, actor);
  assert.equal(events[1][1].data.versions.create.version, 1);
  assert.equal(events[2][1].data.imageFileUuid, fileUuid);
  assert.equal(events[3][2].format, 'webp');
});

test('stale edits and invalid images never write objects or create image metadata', async () => {
  let events = editFixture({ conflict: true });
  assert.deepEqual(await editProduct(input, actor, png), { status: 'conflict' });
  assert.deepEqual(events.map(([kind]) => kind), ['update']);
  events = editFixture();
  assert.deepEqual(await editProduct(input, actor, Buffer.from('<svg/>')), { status: 'invalidImage' });
  assert.deepEqual(await editProduct(input, actor, new Uint8Array(8 * 1024 * 1024 + 1)), { status: 'tooLarge' });
  assert.deepEqual(events, []);
});

test('image edit recovery cleans failed writes and preserves committed images after ambiguous responses', async () => {
  let events = editFixture({ storageFailure: true });
  assert.deepEqual(await editProduct(input, actor, png), { status: 'failed' });
  assert.deepEqual(events.at(-1), ['remove', key]);
  events = editFixture({ lostCommit: true, committed: true });
  assert.deepEqual(await editProduct(input, actor, png), { status: 'ok', uuid });
  assert.equal(events.some(([kind]) => kind === 'remove'), false);
  events = editFixture({ lostCommit: true, committed: true, replacedAgain: true });
  assert.deepEqual(await editProduct(input, actor, png), { status: 'conflict' });
  assert.equal(events.some(([kind]) => kind === 'remove'), false);
});

test('image reads authenticate before database/storage and reject invalid product UUIDs', async () => {
  state.database = new Proxy({}, { get() { throw new Error('Unexpected data read'); } });
  for (const [status, code] of [['unauthenticated', 401], ['forbidden', 403], ['unavailable', 503]]) {
    state.access = status;
    const response = await productImageResponse(uuid);
    assert.equal(response.status, code);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal((await fileImageResponse(fileUuid)).status, code);
  }
  state.access = 'allowed';
  assert.equal((await productImageResponse('../storage-key')).status, 404);
  assert.equal((await fileImageResponse('../storage-key')).status, 404);
});

test('file image preview resolves the latest revision by logical file UUID without requiring a product', async () => {
  state.access = 'allowed';
  let calls = 0;
  state.database = { file: { findUnique: async args => {
    calls++;
    assert.deepEqual(args.where, { uuid: fileUuid, deletingAt: null });
    assert.deepEqual(args.select.versions.orderBy, { version: 'desc' });
    return { versions: [{ seaweedUuid: key, size: BigInt(png.length) }] };
  } } };
  state.storage = { get: async objectKey => { assert.equal(objectKey, key); return png; } };
  const response = await fileImageResponse(fileUuid);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format, 'webp');
  assert.equal(calls, 1);
});

test('downloads require admin access and a valid explicit version before reading files', async () => {
  state.database = new Proxy({}, { get() { throw new Error('Unexpected data read'); } });
  for (const [access, code] of [['unauthenticated', 401], ['forbidden', 403], ['unavailable', 503]]) {
    state.access = access;
    assert.equal((await fileDownloadResponse(fileUuid, '2')).status, code);
  }
  state.access = 'allowed';
  for (const version of [null, '', '0', '-1', '1.5', '2147483648', '../2']) assert.equal((await fileDownloadResponse(fileUuid, version)).status, 404);
  assert.equal((await fileDownloadResponse('../key', '2')).status, 404);
});

test('downloads preserve exact revision bytes and encode Unicode filenames as attachments', async () => {
  state.access = 'allowed';
  const bytes = new Uint8Array([0, 255, 1, 2, 3]);
  let revision = { seaweedUuid: key, size: BigInt(bytes.length), file: { name: 'zażółć "plik".bin' } };
  state.database = { fileVersion: { findUnique: async args => {
    assert.deepEqual(args.where, { fileUuid_version: { fileUuid, version: 2 }, file: { deletingAt: null } });
    return revision;
  } } };
  let reads = 0;
  state.storage = { get: async objectKey => { reads++; assert.equal(objectKey, key); return bytes; } };
  const response = await fileDownloadResponse(fileUuid, '2');
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.match(response.headers.get('content-disposition'), /^attachment; filename="[a-zA-Z0-9._-]+"; filename\*=UTF-8''za%C5%BC/);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  revision = null;
  assert.equal((await fileDownloadResponse(fileUuid, '2')).status, 404);
  revision = { seaweedUuid: key, size: BigInt(8 * 1024 * 1024 + 1), file: { name: 'large.bin' } };
  assert.equal((await fileDownloadResponse(fileUuid, '2')).status, 413);
  assert.equal(reads, 1);
});

test('image response resolves the product latest revision, bounds size and serves safe private WebP', async () => {
  state.access = 'allowed';
  let version = { seaweedUuid: key, size: BigInt(png.length) };
  state.database = { product: { findUnique: async args => {
    assert.deepEqual(args.where, { uuid });
    assert.deepEqual(args.select.imageFile.select.versions.orderBy, { version: 'desc' });
    assert.equal(args.select.imageFile.select.versions.take, 1);
    return { imageFile: { versions: version ? [version] : [] } };
  } } };
  let reads = 0;
  state.storage = { get: async (objectKey, maxBytes) => { reads++; assert.equal(objectKey, key); assert.equal(maxBytes, 8 * 1024 * 1024); return png; } };
  const response = await productImageResponse(uuid);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format, 'webp');
  version = { seaweedUuid: key, size: BigInt(8 * 1024 * 1024 + 1) };
  assert.equal((await productImageResponse(uuid)).status, 422);
  version = null;
  assert.equal((await productImageResponse(uuid)).status, 404);
  assert.equal(reads, 1);
});

test('PDF and corrupt previews return 415 while unavailable storage returns 503', async () => {
 state.access='allowed';
 state.database={file:{findUnique:async()=>({versions:[{seaweedUuid:key,size:BigInt(12)}]})}};
 state.storage={get:async()=>Buffer.from('%PDF-1.7 unsupported')};
 assert.equal((await fileImageResponse(fileUuid)).status,415);
 state.storage={get:async()=>{throw Error('private endpoint');}};
 assert.equal((await fileImageResponse(fileUuid)).status,503);
});
