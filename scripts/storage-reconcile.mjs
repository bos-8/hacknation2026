import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, main, readEnvironment, safePath } from './lib/runtime.mjs';
import { createDatabaseClient } from '../packages/database/dist/index.js';
import { compareInventory, cleanupOrphans, reportHash } from './lib/storage-reconciliation.mjs';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { S3Client, paginateListObjectsV2, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

main(import.meta.url, async () => {
  const [action = 'report', ...args] = process.argv.slice(2);
  const options = Object.fromEntries(Array.from({ length: Math.ceil(args.length / 2) }, (_, index) => [args[index * 2], args[index * 2 + 1]]));
  if (!['report', 'cleanup'].includes(action) || args.length % 2 || Object.keys(options).some(key => !['--report', '--confirm'].includes(key))
    || action === 'report' && args.length || action === 'cleanup' && (!options['--report'] || !options['--confirm'])) {
    throw new Error('Usage: storage-reconcile.mjs report | cleanup --report <path> --confirm <report-sha256>');
  }
  const env = await readEnvironment(ROOT, 'apps/web/.env');
  const bucket = env.S3_BUCKET;
  if (!bucket || !env.S3_ENDPOINT || !env.S3_APP_ACCESS_KEY || !env.S3_APP_SECRET_KEY) throw new Error('Storage configuration required');
  let sources;
  try {
    const endpoint = new URL(env.S3_ENDPOINT), databaseUrl = new URL(env.DATABASE_URL);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error();
    sources = { database: `${databaseUrl.hostname}:${databaseUrl.port || '5432'}${databaseUrl.pathname}`,
      schema: databaseUrl.searchParams.get('schema') || 'public', storage: endpoint.href, bucket };
  } catch { throw new Error('Valid database and storage targets are required; values hidden'); }
  const target = createHash('sha256').update(JSON.stringify(sources)).digest('hex');
  const database = createDatabaseClient({ connectionString: env.DATABASE_URL });
  const client = new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION || 'eu-central-1', forcePathStyle: true,
    maxAttempts: 1, credentials: { accessKeyId: env.S3_APP_ACCESS_KEY, secretAccessKey: env.S3_APP_SECRET_KEY } });
  const store = {
    async head(key) {
      try {
        const item = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(1500) });
        return { etag: item.ETag, modifiedAt: item.LastModified?.toISOString(), size: item.ContentLength };
      } catch (error) { if (error.$metadata?.httpStatusCode === 404) return null; throw error; }
    },
    async remove(key, etag) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key, IfMatch: etag }), { abortSignal: AbortSignal.timeout(1500) });
    },
  };
  try {
    if (action === 'cleanup') {
      const file = path.resolve(ROOT, options['--report']);
      await safePath(ROOT, file);
      const report = JSON.parse(await readFile(file, 'utf8'));
      const results = await cleanupOrphans({ database, store, report, confirmation: options['--confirm'], bucket, target });
      console.log(JSON.stringify(results, null, 2)); return;
    }
    const [versions, unlinkedFiles] = await database.$transaction([
      database.fileVersion.findMany({ select: { fileUuid: true, version: true, seaweedUuid: true, size: true }, take: 100001 }),
      database.file.findMany({ where: { products: { none: {} } }, select: { uuid: true, name: true, _count: { select: { versions: true } } }, take: 100001 }),
    ], { isolationLevel: 'RepeatableRead' });
    if (versions.length > 100000 || unlinkedFiles.length > 100000) throw new Error('Catalog exceeds scan budget; no complete report produced');
    const objects = []; let pages = 0;
    for await (const batch of paginateListObjectsV2({ client, pageSize: 1000 }, { Bucket: bucket }, { abortSignal: AbortSignal.timeout(60000) })) {
      if (++pages > 100) throw new Error('Storage exceeds scan budget; no complete report produced');
      for (const item of batch.Contents ?? []) objects.push({ key: item.Key, size: item.Size, etag: item.ETag, modifiedAt: item.LastModified?.toISOString() });
    }
    const report = { ...compareInventory(versions, objects, unlinkedFiles, bucket), sources, target };
    const directory = path.join(ROOT, 'infra/local/backups');
    await safePath(ROOT, directory); await mkdir(directory, { recursive: true });
    const file = path.join(directory, `reconciliation-${Date.now()}.json`);
    await writeFile(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(`[ok] Report: ${path.relative(ROOT, file)}; missing=${report.missing.length}, mismatches=${report.sizeMismatches.length}, orphans=${report.orphans.length}, unlinked=${unlinkedFiles.length}`);
    console.log(`[info] Review before cleanup. Confirmation SHA-256: ${reportHash(report)}`);
  } finally { client.destroy(); await database.$disconnect(); }
});
