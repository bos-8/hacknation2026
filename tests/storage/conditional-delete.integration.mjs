import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const env = parseEnv(readFileSync('apps/web/.env', 'utf8'));
const local = parseEnv(readFileSync('infra/local/.env.dev', 'utf8'));
assert.equal(local.ENV_MODE, 'dev');
assert.equal(new URL(env.AUTH_BASE_URL).hostname, 'modulon.local');
assert.ok(['localhost', '127.0.0.1', 's3.modulon.local'].includes(new URL(env.S3_ENDPOINT).hostname));

const client = new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION || 'eu-central-1',
  forcePathStyle: true, maxAttempts: 1,
  credentials: { accessKeyId: env.S3_APP_ACCESS_KEY, secretAccessKey: env.S3_APP_SECRET_KEY } });
const input = { Bucket: env.S3_BUCKET, Key: randomUUID() };
const send = command => client.send(command, { abortSignal: AbortSignal.timeout(5000) });
try {
  await send(new PutObjectCommand({ ...input, Body: 'owned conditional-delete verification' }));
  let status;
  try { await send(new DeleteObjectCommand({ ...input, IfMatch: '"definitely-not-the-current-etag"' })); }
  catch (error) { status = error.$metadata?.httpStatusCode; }
  assert.equal(status, 412, 'Storage must reject a mismatched delete precondition');
  const current = await send(new HeadObjectCommand(input));
  await send(new DeleteObjectCommand({ ...input, IfMatch: current.ETag }));
  let absent;
  try { await send(new HeadObjectCommand(input)); }
  catch (error) { absent = error.$metadata?.httpStatusCode; }
  assert.equal(absent, 404);
} finally {
  try { await send(new DeleteObjectCommand(input)); }
  finally { client.destroy(); }
}
console.log('PASS SeaweedFS preserves object on mismatched If-Match and deletes only matching ETag; fixture removed');
