import "server-only";
import { ocrPollSeconds } from "@formiq/database";
import { z } from "zod";
import { getDatabase } from "./database.ts";
import { getFileStore, getFilesConfig } from "./files.ts";
import { FILE_PAGE_SIZE, type FileListPage, type FileListRow, type FileListQuery } from "../schemas/file-list.ts";
import { normalizeProductImage } from "./create-product.ts";
import { MAX_FILE_UPLOAD_BYTES } from "../schemas/file-upload.ts";
import { documentExtensions, type StageTiming } from "../schemas/document-review.ts";
import { fileDeleteSchema, fileStatusChangeSchema, type FileDelete, type FileDetails, type FileStatusChange, type FileStatusResult } from "../schemas/file-status.ts";

const fileDetailsSelect = {
  uuid: true, name: true, status: true, deletingAt: true, createdAt: true, updatedAt: true,
  createdByUuid: true, updatedByUuid: true,
  tags: { select: { tag: { select: { name: true } } } },
} as const;

type CatalogFile = Omit<FileDetails, "tags"> & { name: string; tags: { tag: { name: string } }[] };

function fileDetails(file: CatalogFile): FileDetails {
  return {
    uuid: file.uuid, status: file.status, deletingAt: file.deletingAt, createdAt: file.createdAt, updatedAt: file.updatedAt,
    createdByUuid: file.createdByUuid, updatedByUuid: file.updatedByUuid,
    tags: file.tags.map(item => item.tag.name).sort(),
  };
}

export async function loadCatalogFile(uuid: string) {
  if (!z.uuid().safeParse(uuid).success) return null;
  const file = await getDatabase().file.findUnique({ where: { uuid }, select: {
    ...fileDetailsSelect,
    versions: { orderBy: { version: "desc" }, take: 1, select: { seaweedUuid: true, size: true, version: true, createdAt: true } },
  } });
  const version = file?.versions[0];
  if (!file || file.deletingAt || !version) return null;
  return { key: version.seaweedUuid, name: file.name, version: version.version, size: version.size,
    modifiedAt: version.createdAt, details: fileDetails(file) };
}

export async function updateDocumentStatus(input: FileStatusChange, actorUuid: string): Promise<FileStatusResult> {
  const parsed = fileStatusChangeSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(actorUuid).success) return { status: "invalid" };
  const { uuid, expectedStatus, status } = parsed.data;
  const changed = await getDatabase().file.updateMany({
    where: { uuid, status: expectedStatus, deletingAt: null },
    data: { status, updatedByUuid: actorUuid },
  });
  return { status: changed.count === 1 ? "ok" : "conflict" };
}

export async function deleteDocument(input: FileDelete, actorUuid: string): Promise<FileStatusResult> {
  const parsed = fileDeleteSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(actorUuid).success) return { status: "invalid" };
  const { uuid, expectedStatus, expectedVersion } = parsed.data;
  const database = getDatabase();
  const prepared = await database.$transaction(async transaction => {
    const [locked] = await transaction.$queryRaw<{ deleting_at: Date | null }[]>`
      SELECT deleting_at FROM "file" WHERE "uuid" = ${uuid}::uuid AND "status"::text = ${expectedStatus} FOR UPDATE
    `;
    if (!locked) return { status: "conflict" as const };
    if (await transaction.product.findFirst({ where: { imageFileUuid: uuid }, select: { uuid: true } })) return { status: "inUse" as const };
    if (!locked.deleting_at) {
      if (expectedVersion !== undefined) {
        const latest = await transaction.fileVersion.findFirst({
          where: { fileUuid: uuid }, orderBy: { version: "desc" }, select: { version: true },
        });
        if (latest?.version !== expectedVersion) return { status: "conflict" as const };
      }
      await transaction.$executeRaw`SELECT set_config('app.actor_uuid', ${actorUuid}, true)`;
      await transaction.file.update({ where: { uuid }, data: { deletingAt: new Date(), updatedByUuid: actorUuid } });
    }
    const versions = await transaction.fileVersion.findMany({ where: { fileUuid: uuid }, select: { seaweedUuid: true } });
    return { status: "ok" as const, versions };
  });
  if (prepared.status !== "ok") return prepared;

  // The durable intent hides content and blocks writes before the first S3 delete.
  // If interrupted, all keys remain recorded and deletion can be retried.
  const storage = getFileStore();
  for (const version of prepared.versions) await storage.remove(version.seaweedUuid);

  return database.$transaction(async transaction => {
    const locked = await transaction.$queryRaw<{ uuid: string }[]>`
      SELECT uuid FROM "file" WHERE uuid = ${uuid}::uuid AND deleting_at IS NOT NULL FOR UPDATE
    `;
    if (!locked.length) return { status: "ok" };
    await transaction.$executeRaw`SELECT set_config('app.actor_uuid', ${actorUuid}, true)`;
    await transaction.fileVersion.deleteMany({ where: { fileUuid: uuid } });
    await transaction.file.delete({ where: { uuid } });
    return { status: "ok" };
  });
}

export async function listDocumentRevisions(uuid: string, before: number) {
  const rows = await getDatabase().fileVersion.findMany({
    where: { fileUuid: uuid, version: { lt: before }, file: { deletingAt: null } },
    orderBy: { version: "desc" }, take: 26,
    select: { version: true, size: true, createdAt: true, fileName:true },
  });
  return { rows: rows.slice(0, 25), more: rows.length > 25 };
}

export async function addDocumentRevision(uuid: string, expectedVersion: number, actorUuid: string,
  source: { bytes: Uint8Array; name: string } | { version: number }): Promise<FileStatusResult> {
  const database = getDatabase();
  const storage = getFileStore();
  let attemptedKey: string | undefined;
  try {
    return await database.$transaction(async transaction => {
      const locked = await transaction.$queryRaw<{ uuid: string }[]>`
        SELECT uuid FROM "file" WHERE uuid = ${uuid}::uuid AND deleting_at IS NULL
          AND status::text IN ('active', 'inactive') FOR UPDATE
      `;
      if (!locked.length) return { status: "conflict" };
      const latest = await transaction.fileVersion.findFirst({
        where: { fileUuid: uuid }, orderBy: { version: "desc" }, select: { version: true },
      });
      if (latest?.version !== expectedVersion || expectedVersion >= 2147483647) return { status: "conflict" };
      let bytes: Uint8Array;
      let fileName: string;
      if ("bytes" in source) {
        bytes = source.bytes;
        fileName = source.name;
      } else {
        const old = await transaction.fileVersion.findUnique({
          where: { fileUuid_version: { fileUuid: uuid, version: source.version } },
          select: { seaweedUuid: true, size: true, fileName: true, file: { select: { name: true } } },
        });
        if (!old || source.version >= expectedVersion || old.size > BigInt(MAX_FILE_UPLOAD_BYTES)) return { status: "invalid" };
        bytes = await storage.get(old.seaweedUuid, MAX_FILE_UPLOAD_BYTES);
        if (BigInt(bytes.byteLength) !== old.size) return { status: "failed" };
        fileName = old.fileName ?? old.file.name;
      }
      if (await transaction.product.findFirst({ where: { imageFileUuid: uuid }, select: { uuid: true } })) {
        // Product previews follow the latest revision, so their file must remain an image.
        try {
          const normalized = await normalizeProductImage(bytes);
          if ("bytes" in source) {
            bytes = normalized;
            fileName = fileName.replace(/\.[^.]+$/, "") + ".webp";
          }
        } catch { return { status: "invalid" }; }
      }
      const [object] = await transaction.$queryRaw<{ uuid: string }[]>`SELECT uuidv7()::text AS uuid`;
      await transaction.fileVersion.create({ data: { fileUuid: uuid, version: expectedVersion + 1,
        size: BigInt(bytes.byteLength), seaweedUuid: object.uuid, fileName, createdByUuid: actorUuid } });
      await transaction.file.update({ where: { uuid }, data: { updatedByUuid: actorUuid } });
      attemptedKey = object.uuid;
      await storage.put(object.uuid, bytes);
      return { status: "ok" };
    }, { timeout: 30000 });
  } catch {
    if (attemptedKey) {
      try {
        if (await database.fileVersion.findUnique({ where: { seaweedUuid: attemptedKey }, select: { uuid: true } })) return { status: "ok" };
        await storage.remove(attemptedKey);
      } catch { console.error("File revision recovery could not confirm object cleanup"); }
    }
    return { status: "failed" };
  }
}

export async function createDocument(name: string, body: Uint8Array, actorUuid: string, formModifiedAt?: Date) {
  const database = getDatabase();
  const storage = getFileStore();
  let attemptedKey: string | undefined;

  try {
    return await database.$transaction(async transaction => {
      const [object] = await transaction.$queryRaw<{ uuid: string }[]>`SELECT uuidv7()::text AS uuid`;
      const file = await transaction.file.create({
        data: {
          name,
          ...(formModifiedAt && { formUpload: { create: { modifiedAt: formModifiedAt } } }),
          createdByUuid: actorUuid,
          updatedByUuid: actorUuid,
          versions: { create: { version: 1, size: BigInt(body.byteLength), seaweedUuid: object.uuid, createdByUuid: actorUuid } },
        },
        select: { uuid: true },
      });
      attemptedKey = object.uuid;
      await storage.put(object.uuid, body);
      return file.uuid;
    }, { timeout: 25000 });
  } catch {
    if (attemptedKey) {
      try {
        // A lost commit response is ambiguous. Keep the object if the catalog already points to it.
        const saved = await database.fileVersion.findUnique({ where: { seaweedUuid: attemptedKey }, select: { fileUuid: true } });
        if (saved) return saved.fileUuid;
        await storage.remove(attemptedKey);
      } catch {
        console.error("Document upload recovery could not confirm object cleanup");
      }
    }
    throw new Error("Document upload failed");
  }
}

export async function loadFileList(query: FileListQuery): Promise<FileListPage> {
  const name = query.search.replace(/[\\%_]/g, "\\$&");
  const limit = query.limit ?? FILE_PAGE_SIZE;
  const later = { version: { gt: 1 } };
  const where = {
    ...(name ? { name: { contains: name, mode: "insensitive" as const } } : {}),
    ...(query.tags ? { tags: query.tags === "tagged" ? { some: {} } : { none: {} } } : {}),
    versions: query.revision === "later" ? { some: later }
      : query.revision === "first" ? { some: {}, none: later } : { some: {} },
  };
  const database = getDatabase();
  const [total, files] = await database.$transaction([
    database.file.count({ where }),
    database.file.findMany({
      where, orderBy: { uuid: "desc" }, skip: ((query.page ?? 1) - 1) * limit, take: limit,
      select: { ...fileDetailsSelect, _count: { select: { versions: true } },
        versions: { orderBy: { version: "desc" }, take: 1,
          select: { seaweedUuid: true, version: true, size: true, createdAt: true } } },
    }),
  ], { isolationLevel: "RepeatableRead" });
  return {
    bucket: getFilesConfig().S3_BUCKET, metadataReady: true, total,
    rows: files.map(file => {
      const version = file.versions[0];
      return { key: version.seaweedUuid, name: file.name, version: version.version, size: version.size,
        modifiedAt: version.createdAt, details: fileDetails(file), revisionCount: file._count.versions };
    }),
  };
}

function ocrProcessing(runs: (StageTiming & { stage: string; ocrProgress: number | null })[]): NonNullable<FileListRow["processing"]> {
  const active = runs.filter(run => run.stage === "ocr");
  const current = active.find(run => run.startedAt) ?? active[0];
  if (current) {
    const { queuedAt, startedAt, sampledAt, estimateMs } = current;
    return { state: startedAt ? "ocrRunning" : "ocrQueued", percent: current.ocrProgress ?? undefined,
      timing: { queuedAt, startedAt, sampledAt, estimateMs } };
  }
  if (runs.some(run => ["ocr_review", "detect", "detect_failed", "review", "approved"].includes(run.stage))) return { state: "ocrDone" };
  return { state: runs.length ? "ocrFailed" : "ocrNone" };
}

/** Each eligible revision is an OCR input, including historical files with a legacy null name. */
export async function loadOcrFileList(query: FileListQuery, actorUuid: string): Promise<FileListPage> {
  const limit = query.limit ?? FILE_PAGE_SIZE;
  const extensions = query.extensions?.length ? query.extensions : documentExtensions;
  const search = query.search.replace(/[\\%_]/g, "\\$&");
  const where = {
    file: {
      deletingAt: null,
      ...(query.tags && { tags: query.tags === "tagged" ? { some: {} } : { none: {} } }),
    },
    size: { gt: 0, lte: MAX_FILE_UPLOAD_BYTES },
    ...(query.revision && { version: query.revision === "first" ? 1 : { gt: 1 } }),
    OR: extensions.flatMap(endsWith => {
      const name = { endsWith, contains: search, mode: "insensitive" as const };
      return [{ fileName: name }, { fileName: null, file: { name } }];
    }),
  };
  const db = getDatabase();
  const [total, versions] = await db.$transaction([
    db.fileVersion.count({ where }),
    db.fileVersion.findMany({
      where, orderBy: [{ createdAt: "desc" }, { uuid: "desc" }],
      skip: ((query.page ?? 1) - 1) * limit, take: limit,
      select: { fileName: true, seaweedUuid: true, size: true, createdAt: true, version: true, imageOcrCompletedAt: true,
        analyses: { where: { actorUuid }, orderBy: { queuedAt: "desc" }, select: { stage: true, ocrProgress: true, queuedAt: true, startedAt: true, sampledAt: true, estimateMs: true } },
        file: { select: { ...fileDetailsSelect, versions: { orderBy: { version: "desc" }, take: 1, select: { version: true } } } } },
    }),
  ], { isolationLevel: "RepeatableRead" });
  return {
    bucket: getFilesConfig().S3_BUCKET, metadataReady: true, total, pollSeconds: await ocrPollSeconds(db),
    rows: versions.map(row => ({
      key: row.seaweedUuid, name: row.fileName ?? row.file.name, version: row.version, size: row.size,
      modifiedAt: row.createdAt, details: fileDetails(row.file), latestVersion: row.file.versions[0].version,
      processing: row.imageOcrCompletedAt ? { state: "ocrDone" } : ocrProcessing(row.analyses),
    })),
  };
}
