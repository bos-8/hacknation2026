import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileStore, getFilesConfig, parseFilesCursor } from '../../apps/web/src/server/files.ts';
import { canChangeFileStatus, fileStatusChangeSchema } from '../../apps/web/src/schemas/file-status.ts';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { S3Client } = require('@aws-sdk/client-s3');
const fixture = {
  S3_ENDPOINT: 'http://127.0.0.1:8333',
  S3_BUCKET: 'documents-fixture',
  S3_APP_ACCESS_KEY: 'fixture-key',
  S3_APP_SECRET_KEY: 'fixture-secret',
};

test('storage dashboard counts every metadata page, sums bytes exactly and records the newest object', async t => {
  let calls = 0;
  t.mock.method(S3Client.prototype, 'send', async command => {
    calls++;
    assert.equal(command.input.MaxKeys, 1000);
    return calls === 1 ? { Contents: [{ Key: 'first', Size: 7, LastModified: new Date('2026-11-10') }], IsTruncated: true, NextContinuationToken: 'next' }
      : { Contents: [{ Key: 'second', Size: 13, LastModified: new Date('2026-11-17') }], IsTruncated: false };
  });
  const store = fileStore(getFilesConfig(fixture));
  try { assert.deepEqual(await store.summary(), { objects: 2, bytes: '20', lastModified: '2026-11-17T00:00:00.000Z' }); }
  finally { store.close(); }
  assert.equal(calls, 2);
});

test('storage dashboard refuses repeated pagination tokens instead of returning a partial total', async t => {
  t.mock.method(S3Client.prototype, 'send', async () => ({ Contents: [], IsTruncated: true, NextContinuationToken: 'same' }));
  const store = fileStore(getFilesConfig(fixture));
  try { await assert.rejects(store.summary(), /Repeated/); } finally { store.close(); }
});

test('file previews enforce header and streamed byte limits and cancel discarded bodies', async t => {
  const uuid = '019a75c0-0000-7000-8000-000000000001';
  let contentLength = 6;
  let cancelled = 0;
  let offset = 0;
  t.mock.method(S3Client.prototype, 'send', async (command, options) => {
    assert.equal(command.constructor.name, 'GetObjectCommand');
    assert.equal(command.input.Key, uuid);
    assert.ok(options.abortSignal);
    offset = 0;
    return { ContentLength: contentLength, Body: { transformToWebStream: () => new ReadableStream({
      pull(controller) { if (offset++ < 2) controller.enqueue(new Uint8Array([1, 2, 3])); else controller.close(); },
      cancel() { cancelled++; },
    }, { highWaterMark: 0 }) } };
  });
  const store = fileStore(getFilesConfig(fixture));
  assert.deepEqual(await store.get(uuid, 8), new Uint8Array([1, 2, 3, 1, 2, 3]));
  await assert.rejects(store.get(uuid, 4), /preview limit/);
  assert.equal(cancelled, 1);
  // A lying size header cannot bypass the streamed byte limit.
  contentLength = 1;
  await assert.rejects(store.get(uuid, 4), /preview limit/);
  assert.equal(cancelled, 2);
});

test('file status changes reject repeated actions and allow restoring files from deletion or archive states', () => {
  const targets = {
    active: ['inactive', 'pending_archiving', 'pending_deletion'],
    inactive: ['active', 'pending_archiving', 'pending_deletion'],
    pending_deletion: ['active', 'inactive', 'pending_archiving'],
    softdelete: ['active', 'inactive', 'pending_archiving', 'pending_deletion'],
    pending_archiving: ['active', 'inactive', 'pending_deletion'],
  };
  for (const [from, allowed] of Object.entries(targets)) {
    for (const to of Object.keys(targets)) {
      const input = { uuid: '019a75c0-0000-7000-8000-000000000001', expectedStatus: from, status: to };
      assert.equal(canChangeFileStatus(from, to), allowed.includes(to), `${from} -> ${to}`);
      assert.equal(fileStatusChangeSchema.safeParse(input).success, allowed.includes(to), `${from} -> ${to} server input`);
    }
  }
  assert.equal(fileStatusChangeSchema.safeParse({
    uuid: '019a75c0-0000-7000-8000-000000000001', expectedStatus: 'active', status: 'unknown',
  }).success, false);
});

test('file listing reads one bounded page, decodes object keys and preserves the continuation token', async (t) => {
  const modifiedAt = new Date('2026-11-11T12:00:00Z');
  const send = t.mock.method(S3Client.prototype, 'send', async (command, options) => {
    assert.equal(command.constructor.name, 'ListObjectsV2Command');
    assert.deepEqual(command.input, { Bucket: 'documents-fixture', EncodingType: 'url', MaxKeys: 25, ContinuationToken: 'previous+/=' });
    assert.ok(options.abortSignal instanceof AbortSignal);
    return { EncodingType: 'url', Contents: [{ Key: 'folder/%C5%BC%C3%B3%C5%82%C4%87%20%2520.pdf', Size: 512, LastModified: modifiedAt }],
      IsTruncated: true, NextContinuationToken: 'next+/=' };
  });
  const page = await fileStore(getFilesConfig(fixture)).list('previous+/=');
  assert.deepEqual(page, { bucket: 'documents-fixture', files: [{ key: 'folder/żółć %20.pdf', size: 512, modifiedAt }], nextCursor: 'next+/=' });
  assert.equal(send.mock.callCount(), 1);
});

test('file listing rejects oversized cursors and treats a missing next token as a storage failure', async (t) => {
  const send = t.mock.method(S3Client.prototype, 'send', async () => ({ IsTruncated: true }));
  const store = fileStore(getFilesConfig(fixture));
  const largeCursor = 'x'.repeat(4097);
  assert.equal(parseFilesCursor(largeCursor), undefined);
  assert.equal(parseFilesCursor(['one', 'two']), undefined);
  await assert.rejects(store.list(largeCursor), /File storage unavailable/);
  assert.equal(send.mock.callCount(), 0);
  await assert.rejects(store.list(), /File storage unavailable/);
});

test('numbered storage pages count all objects across batches and retain only the requested window', async t => {
  const modifiedAt = new Date('2026-11-12T12:00:00Z');
  const objects = Array.from({ length: 27 }, (_, index) => ({ Key: `folder/file%20${String(index).padStart(2, '0')}`, Size: index, LastModified: modifiedAt }));
  const send = t.mock.method(S3Client.prototype, 'send', async command => {
    assert.equal(command.input.MaxKeys, 1000);
    assert.equal(command.input.Bucket, 'documents-fixture');
    return command.input.ContinuationToken === 'batch-2'
      ? { EncodingType: 'url', Contents: objects.slice(20), IsTruncated: false }
      : { EncodingType: 'url', Contents: objects.slice(0, 20), IsTruncated: true, NextContinuationToken: 'batch-2' };
  });
  const page = await fileStore(getFilesConfig(fixture)).page(3, 10);
  assert.equal(page.total, 27); assert.equal(page.files.length, 7);
  assert.equal(page.files[0].key, 'folder/file 20'); assert.equal(page.files[6].key, 'folder/file 26');
  assert.equal(send.mock.callCount(), 2);
  const empty = await fileStore(getFilesConfig(fixture)).page(4, 10);
  assert.equal(empty.total, 27); assert.deepEqual(empty.files, []);
});

test('storage page totals fail closed on missing or repeated continuation tokens', async t => {
  const send = t.mock.method(S3Client.prototype, 'send', async () => ({ IsTruncated: true }));
  const store = fileStore(getFilesConfig(fixture));
  await assert.rejects(store.page(0, 10), /File storage unavailable/);
  assert.equal(send.mock.callCount(), 0);
  await assert.rejects(store.page(1, 10), /File storage unavailable/);
  send.mock.mockImplementation(async () => ({ IsTruncated: true, NextContinuationToken: 'same-token' }));
  await assert.rejects(store.page(1, 10), /File storage unavailable/);
});
