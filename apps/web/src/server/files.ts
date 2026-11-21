import "server-only";
import { DeleteObjectCommand, GetObjectCommand, paginateListObjectsV2, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { parseConfig } from "../config/parse.ts";
import { createS3Client, s3BucketSchema, s3EndpointSchema } from "./s3.ts";
import { FILE_PAGE_SIZE, filePageSizeSchema } from "../schemas/file-list.ts";

const cursorSchema = z.string().min(1).max(4096);
const objectSchema = z.object({
  Key: z.string().min(1),
  Size: z.number().int().nonnegative(),
  LastModified: z.date(),
});
const configSchema = z.object({
  S3_ENDPOINT: s3EndpointSchema,
  S3_REGION: z.string().min(1).default("eu-central-1"),
  S3_BUCKET: s3BucketSchema,
  S3_APP_ACCESS_KEY: z.string().min(1),
  S3_APP_SECRET_KEY: z.string().refine(value => value.trim().length > 0),
});

export function getFilesConfig(values: unknown = process.env) {
  return parseConfig(configSchema, values, "file storage");
}

export function fileStore(config: ReturnType<typeof getFilesConfig>) {
  const client = createS3Client({ endpoint: config.S3_ENDPOINT, region: config.S3_REGION,
    accessKeyId: config.S3_APP_ACCESS_KEY, secretAccessKey: config.S3_APP_SECRET_KEY });

  return {
    close() { client.destroy(); },
    async summary() {
      let objects = 0, bytes = BigInt(0), batches = 0;
      let lastModified: Date | null = null;
      const tokens = new Set<string>();
      const pages = paginateListObjectsV2({ client, pageSize: 1000 }, { Bucket: config.S3_BUCKET },
        { abortSignal: AbortSignal.timeout(5000) });
      for await (const batch of pages) {
        if (++batches > 100) throw new Error('Storage summary exceeds its scan budget');
        for (const item of z.array(objectSchema).max(1000).parse(batch.Contents ?? [])) {
          objects++;
          bytes += BigInt(item.Size);
          if (!lastModified || item.LastModified > lastModified) lastModified = item.LastModified;
        }
        if (batch.IsTruncated) {
          const token = cursorSchema.parse(batch.NextContinuationToken);
          if (tokens.has(token)) throw new Error('Repeated file storage cursor');
          tokens.add(token);
          if (batches === 100) throw new Error('Storage summary exceeds its scan budget');
        }
      }
      return { objects, bytes: bytes.toString(), lastModified: lastModified?.toISOString() ?? null };
    },
    async get(key: string, maxBytes = 8 * 1024 * 1024) {
      z.number().int().min(1).max(8 * 1024 * 1024).parse(maxBytes);
      const result = await client.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: z.uuid().parse(key) }),
        { abortSignal: AbortSignal.timeout(15000) });
      if (!result.Body) throw new Error("File storage returned no data");
      const reader = result.Body.transformToWebStream().getReader();
      try {
        if ((result.ContentLength ?? Infinity) > maxBytes) throw new Error("Stored file exceeds preview limit");
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) throw new Error("Stored file exceeds preview limit");
          chunks.push(value);
        }
        return new Uint8Array(Buffer.concat(chunks, size));
      } finally {
        try { await reader.cancel(); } finally { reader.releaseLock(); }
      }
    },
    async put(key: string, body: Uint8Array) {
      await client.send(new PutObjectCommand({
        Bucket: config.S3_BUCKET, Key: z.uuid().parse(key), Body: body,
        ContentLength: body.byteLength, ContentType: "application/octet-stream",
      }), { abortSignal: AbortSignal.timeout(15000) });
    },
    async remove(key: string) {
      await client.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: z.uuid().parse(key) }),
        { abortSignal: AbortSignal.timeout(15000) });
    },
    async page(page = 1, limit = FILE_PAGE_SIZE) {
      try {
        const size = filePageSizeSchema.parse(limit);
        const number = z.number().int().min(1).max(40001).parse(page);
        const offset = (number - 1) * size;
        const files: { key: string; size: number; modifiedAt: Date }[] = [];
        let total = 0;
        const seen = new Set<string>();
        const pages = paginateListObjectsV2({ client, pageSize: 1000 }, { Bucket: config.S3_BUCKET, EncodingType: "url" },
          { abortSignal: AbortSignal.timeout(30000) });
        // S3 has no exact object-count API. Scan metadata in batches, retaining only
        // the requested window so last-page links and totals cover uncatalogued files too.
        for await (const batch of pages) {
          const objects = z.array(objectSchema).max(1000).parse(batch.Contents ?? []);
          for (const object of objects) {
            if (total >= offset && files.length < size) files.push({
              key: batch.EncodingType === "url" ? decodeURIComponent(object.Key) : object.Key,
              size: object.Size, modifiedAt: object.LastModified,
            });
            total += 1;
          }
          if (batch.IsTruncated) {
            const token = cursorSchema.parse(batch.NextContinuationToken);
            if (seen.has(token)) throw new Error("Repeated file storage cursor");
            seen.add(token);
          }
        }
        return { bucket: config.S3_BUCKET, files, total };
      } catch {
        throw new Error("File storage unavailable");
      }
    },
    async list(cursor?: string, limit = FILE_PAGE_SIZE) {
      try {
        const size = filePageSizeSchema.parse(limit);
        const pages = paginateListObjectsV2({ client, pageSize: size, startingToken: cursorSchema.optional().parse(cursor) },
          { Bucket: config.S3_BUCKET, EncodingType: "url" }, { abortSignal: AbortSignal.timeout(15000) });
        // A request reads one bounded page. The next link carries the provider's opaque token.
        for await (const page of pages) {
          const objects = z.array(objectSchema).max(size).parse(page.Contents ?? []);
          return {
            bucket: config.S3_BUCKET,
            files: objects.map(object => ({
              key: page.EncodingType === "url" ? decodeURIComponent(object.Key) : object.Key,
              size: object.Size,
              modifiedAt: object.LastModified,
            })),
            nextCursor: page.IsTruncated ? cursorSchema.parse(page.NextContinuationToken) : undefined,
          };
        }
      } catch {
        // Do not forward provider URLs, XML or credentials to the page.
      }
      throw new Error("File storage unavailable");
    },
  };
}

let store: ReturnType<typeof fileStore> | undefined;
export function getFileStore() { return store ??= fileStore(getFilesConfig()); }

export async function listFiles(cursor?: string, limit?: number) {
  return getFileStore().list(cursor, limit);
}

export async function listFilePage(page?: number, limit?: number) {
  return getFileStore().page(page, limit);
}

export function parseFilesCursor(value: unknown) {
  return cursorSchema.safeParse(value).data;
}
