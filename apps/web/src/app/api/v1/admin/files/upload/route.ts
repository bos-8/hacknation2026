import { fileRevisionTargetSchema, parseFileVersion } from "@/schemas/file-list";
import { MAX_FILE_UPLOAD_BYTES, type FileUploadResult } from "@/schemas/file-upload";
import { withAdminSession } from "@/server/auth/admin-action";
import { getAuthConfig } from "@/server/auth/config";
import { addDocumentRevision, createDocument } from "@/server/file-catalog";

const activeUploads = new Set<string>();
const statusCodes: Record<FileUploadResult["status"], number> = {
  ok: 200, invalid: 400, denied: 403, tooLarge: 413, conflict: 409, busy: 429, uploadFailed: 503,
};

function reply(status: FileUploadResult["status"]) {
  return Response.json({ status }, { status: statusCodes[status], headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) return reply("denied");
  const result = await withAdminSession<FileUploadResult>(async actorUuid => {
    if (activeUploads.has(actorUuid)) return { status: "busy" };
    if (request.headers.get("content-type") !== "application/octet-stream") return { status: "invalid" };
    const url = new URL(request.url);
    const uuid = url.searchParams.get("uuid");
    const version = url.searchParams.get("expectedVersion");
    const target = uuid !== null || version !== null
      ? fileRevisionTargetSchema.safeParse({ uuid, expectedVersion: parseFileVersion(version) }) : undefined;
    if (target && !target.success) return { status: "invalid" };
    const encoded = request.headers.get("x-file-name");
    let name: string;
    try {
      if (!encoded || encoded.length > 3060) return { status: "invalid" };
      name = decodeURIComponent(encoded).normalize("NFC").trim();
    } catch { return { status: "invalid" }; }
    if (!name || name.length > 255 || name === "." || name === ".." || /[\\/\p{Cc}]/u.test(name)) return { status: "invalid" };
    if (Number(request.headers.get("content-length")) > MAX_FILE_UPLOAD_BYTES) return { status: "tooLarge" };
    const reader = request.body?.getReader();
    if (!reader) return { status: "invalid" };

    activeUploads.add(actorUuid);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      void reader.cancel().catch(() => undefined);
    }, 120000);
    try {
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > MAX_FILE_UPLOAD_BYTES) {
            await reader.cancel().catch(() => undefined);
            return { status: "tooLarge" };
          }
          chunks.push(value);
        }
      } finally { clearTimeout(timer); }
      if (timedOut) return { status: "uploadFailed" };
      if (!length) return { status: "invalid" };
      const bytes = Buffer.concat(chunks, length);
      if (target?.success) {
        const revision = await addDocumentRevision(target.data.uuid, target.data.expectedVersion, actorUuid, { bytes, name });
        return { status: revision.status === "ok" || revision.status === "conflict" || revision.status === "invalid"
          ? revision.status : "uploadFailed" };
      }
      await createDocument(name, bytes, actorUuid);
      return { status: "ok" };
    } catch {
      return { status: "uploadFailed" };
    } finally {
      activeUploads.delete(actorUuid);
    }
  });
  return reply(result.status);
}
