import "server-only";
import { createHash, createHmac } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { z } from "zod";
import { parseConfig } from "../config/parse.ts";
import { getAuthConfig } from "./auth/config.ts";
import { createS3Client, s3BucketSchema, s3EndpointSchema } from "./s3.ts";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const avatarKey = /^[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/;
const configSchema = z.object({
  S3_AVATAR_ENDPOINT: s3EndpointSchema,
  S3_AVATAR_REGION: z.string().min(1).default("eu-central-1"),
  S3_AVATAR_BUCKET: s3BucketSchema,
  S3_AVATAR_ACCESS_KEY: z.string().min(1), S3_AVATAR_SECRET_KEY: z.string().min(16),
});

export function getAvatarConfig(values: unknown = process.env) {
  return parseConfig(configSchema, values, "avatar");
}
export interface AvatarStore {
  put(key: string, body: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export function avatarStore(config: ReturnType<typeof getAvatarConfig>): AvatarStore {
  const client = createS3Client({ endpoint: config.S3_AVATAR_ENDPOINT, region: config.S3_AVATAR_REGION,
    accessKeyId: config.S3_AVATAR_ACCESS_KEY, secretAccessKey: config.S3_AVATAR_SECRET_KEY });
  return {
    async put(key, body) {
      await client.send(new PutObjectCommand({ Bucket: config.S3_AVATAR_BUCKET, Key: key, Body: body, ContentType: "image/webp" }),
        { abortSignal: AbortSignal.timeout(15000) });
    },
    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: config.S3_AVATAR_BUCKET, Key: key }),
          { abortSignal: AbortSignal.timeout(15000) });
        if (!result.Body) return null;
        if ((result.ContentLength ?? Infinity) > 512 * 1024) {
          if ("destroy" in result.Body) result.Body.destroy();
          throw new Error("Invalid stored avatar");
        }
        return result.Body.transformToByteArray();
      } catch (error) {
        if ((error as { name?: string }).name === "NoSuchKey") return null;
        throw new Error("Avatar storage unavailable");
      }
    },
  };
}

/** Decode pixels, strip metadata and reject SVG, animation and oversized dimensions. */
export async function normalizeAvatar(bytes: Uint8Array): Promise<Uint8Array> {
  if (!bytes.length || bytes.length > AVATAR_MAX_BYTES) throw new Error("Invalid image size");
  const signature = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const png = signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  const webp = signature.toString("ascii", 0, 4) === "RIFF" && signature.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) throw new Error("Invalid image format");
  const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" });
  const info = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(info.format ?? "") || (info.pages ?? 1) !== 1) throw new Error("Invalid image format");
  return image.rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
}

type AvatarIdentity = { keycloakUuid: string };
type AvatarBoundary = { appOrigin: string; accountOrigin: string; secret: string };

export function createAvatarService(boundary: AvatarBoundary, store: AvatarStore) {
  const attempts = new Map<string, { start: number; count: number }>();
  function headers(origin: string | null) {
    const result = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
    if (origin === boundary.appOrigin || origin === boundary.accountOrigin) {
      result.set("Access-Control-Allow-Origin", origin);
      result.set("Access-Control-Allow-Credentials", "true");
      result.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      result.set("Access-Control-Allow-Headers", "Content-Type");
    }
    return result;
  }
  return {
    async upload(request: Request, identify: () => Promise<AvatarIdentity | null>): Promise<Response> {
      const origin = request.headers.get("origin");
      const responseHeaders = headers(origin);
      const fail = (error: string, status: number) => Response.json({ error }, { status, headers: responseHeaders });
      if (origin !== boundary.appOrigin && origin !== boundary.accountOrigin) return fail("origin_not_allowed", 403);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders });
      if (request.method !== "POST") return fail("method_not_allowed", 405);
      let identity: AvatarIdentity | null;
      try { identity = await identify(); } catch { return fail("authentication_unavailable", 503); }
      if (!identity || !z.uuid().safeParse(identity.keycloakUuid).success) return fail("sign_in_required", 401);
      const now = Date.now();
      for (const [key, value] of attempts) if (now - value.start >= 60000) attempts.delete(key);
      const attempt = attempts.get(identity.keycloakUuid) ?? { start: now, count: 0 };
      if (attempt.count >= 6 || (!attempts.has(identity.keycloakUuid) && attempts.size >= 10000)) return fail("rate_limited", 429);
      attempt.count++; attempts.set(identity.keycloakUuid, attempt);
      if (!["image/png", "image/jpeg", "image/webp"].includes(request.headers.get("content-type") ?? "")) return fail("invalid_image", 415);
      if (Number(request.headers.get("content-length")) > AVATAR_MAX_BYTES) return fail("image_too_large", 413);
      const reader = request.body?.getReader();
      if (!reader) return fail("invalid_image", 400);
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > AVATAR_MAX_BYTES) { await reader.cancel(); return fail("image_too_large", 413); }
          chunks.push(value);
        }
      } catch { return fail("invalid_image", 400); }
      let image: Uint8Array;
      try { image = await normalizeAvatar(Buffer.concat(chunks)); } catch { return fail("invalid_image", 415); }
      const owner = createHmac("sha256", boundary.secret).update(`avatar:${identity.keycloakUuid}`).digest("hex");
      const file = `${createHash("sha256").update(image).digest("hex")}.webp`;
      try { await store.put(`${owner}/${file}`, image); } catch { return fail("storage_unavailable", 503); }
      return Response.json({ url: `${boundary.appOrigin}/api/v1/avatars/${owner}/${file}` }, { headers: responseHeaders });
    },
    async read(owner: string, file: string): Promise<Response> {
      if (!avatarKey.test(`${owner}/${file}`)) return new Response(null, { status: 404 });
      try {
        const bytes = await store.get(`${owner}/${file}`);
        if (!bytes) return new Response(null, { status: 404 });
        return new Response(Buffer.from(bytes), { headers: {
          "Content-Type": "image/webp", "Content-Length": String(bytes.byteLength),
          "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'", "Cross-Origin-Resource-Policy": "cross-origin",
        } });
      } catch { return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } }); }
    },
  };
}

let service: ReturnType<typeof createAvatarService> | undefined;
export function getAvatarService() {
  const auth = getAuthConfig();
  return service ??= createAvatarService({ appOrigin: auth.AUTH_BASE_URL, accountOrigin: new URL(auth.AUTH_ISSUER).origin,
    secret: auth.AUTH_SECRET }, avatarStore(getAvatarConfig()));
}
