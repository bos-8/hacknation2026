import "server-only";
import { z } from "zod";
import { getAccess } from "./auth/access.ts";
import { ADMIN_ACCESS } from "../schemas/access.ts";
import { MAX_FILE_UPLOAD_BYTES } from "../schemas/file-upload.ts";
import { getDatabase } from "./database.ts";
import { getFileStore } from "./files.ts";
import { parseFileVersion } from "../schemas/file-list.ts";

/** Download the selected catalog revision, preserving its original bytes. */
export async function fileDownloadResponse(uuid: string, version: string | null, preview = false): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Vary": "Cookie", "Cross-Origin-Resource-Policy": "same-origin" };
  const error = (status: number) => new Response(null, { status, headers });
  const access = await getAccess(ADMIN_ACCESS);
  if (access.status !== "allowed") return error(access.status === "unauthenticated" ? 401 : access.status === "unavailable" ? 503 : 403);
  const revisionNumber = parseFileVersion(version);
  if (!z.uuid().safeParse(uuid).success || !revisionNumber) return error(404);
  try {
    const revision = await getDatabase().fileVersion.findUnique({
      where: { fileUuid_version: { fileUuid: uuid, version: revisionNumber }, file: { deletingAt: null } },
      select: { seaweedUuid: true, size: true, fileName: true, file: { select: { name: true } } },
    });
    if (!revision) return error(404);
    if (revision.size < BigInt(0) || revision.size > BigInt(MAX_FILE_UPLOAD_BYTES)) return error(413);
    const bytes = await getFileStore().get(revision.seaweedUuid, MAX_FILE_UPLOAD_BYTES);
    const name = revision.fileName ?? revision.file.name;
    let mime = "application/octet-stream";
    if (preview) {
      const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (/\.pdf$/i.test(name) && data.subarray(0, 5).toString() === "%PDF-") mime = "application/pdf";
      else if (/\.png$/i.test(name) && data.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") mime = "image/png";
      else if (/\.jpe?g$/i.test(name) && data.subarray(0, 3).toString("hex") === "ffd8ff") mime = "image/jpeg";
      else return error(415);
    }
    const fallback = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "download";
    const encoded = encodeURIComponent(name).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(new Uint8Array(bytes), { headers: { ...headers,
      "Content-Type": mime, "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encoded}`,
    } });
  } catch { return error(503); }
}
