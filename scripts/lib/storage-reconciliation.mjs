import { createHash } from 'node:crypto';

export const reportHash = report => createHash('sha256').update(JSON.stringify(report)).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function compareInventory(versions, objects, unlinkedFiles, bucket, now = new Date()) {
  const stored = new Map(objects.map(object => [object.key, object]));
  const referenced = new Set(versions.map(version => version.seaweedUuid));
  return { schema: 1, bucket, generatedAt: now.toISOString(),
    missing: versions.filter(version => !stored.has(version.seaweedUuid)).map(version => ({
      fileUuid: version.fileUuid, version: version.version, key: version.seaweedUuid,
    })),
    sizeMismatches: versions.filter(version => stored.has(version.seaweedUuid) && String(version.size) !== String(stored.get(version.seaweedUuid).size))
      .map(version => ({ key: version.seaweedUuid, expected: String(version.size), actual: String(stored.get(version.seaweedUuid).size) })),
    orphans: objects.filter(object => !referenced.has(object.key)),
    unlinkedFiles,
  };
}

/** Explicit report approval, minimum age and locked live revalidation precede each delete. */
export async function cleanupOrphans({ database, store, report, confirmation, bucket, target, now = new Date() }) {
  if (report.schema !== 1 || report.bucket !== bucket || confirmation !== reportHash(report)
    || target !== undefined && report.target !== target
    || !Array.isArray(report.orphans) || report.orphans.length > 100000
    || !Number.isFinite(Date.parse(report.generatedAt)) || Date.parse(report.generatedAt) > now.getTime()
    || now.getTime() - Date.parse(report.generatedAt) > 86400000) throw new Error('Invalid, stale or unapproved reconciliation report');
  const results = [];
  for (const candidate of report.orphans) {
    if (!uuid.test(candidate.key) || !candidate.etag || !Number.isFinite(Date.parse(candidate.modifiedAt))
      || Date.parse(candidate.modifiedAt) > now.getTime() - 86400000) {
      results.push({ key: candidate.key, status: 'protected' }); continue;
    }
    const status = await database.$transaction(async transaction => {
      // Uploads create FileVersion before writing S3. Wait for any in-flight catalog
      // transaction, then block new references until the bounded S3 delete completes.
      await transaction.$executeRaw`LOCK TABLE public.file_version IN SHARE ROW EXCLUSIVE MODE`;
      if (await transaction.fileVersion.findUnique({ where: { seaweedUuid: candidate.key }, select: { uuid: true } })) return 'referenced';
      const current = await store.head(candidate.key);
      if (!current) return 'absent';
      if (current.etag !== candidate.etag || current.modifiedAt !== candidate.modifiedAt || String(current.size) !== String(candidate.size)) return 'changed';
      await store.remove(candidate.key, current.etag);
      return 'deleted';
    }, { timeout: 5000, maxWait: 2000 });
    results.push({ key: candidate.key, status });
  }
  return results;
}
