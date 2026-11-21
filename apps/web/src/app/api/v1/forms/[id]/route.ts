import { z } from "zod";
import { LOGGED_ACCESS } from "@/schemas/access";
import { MAX_FORM_BYTES, formMediaType, formProcessingResult, formatFormResult, hasFormResult } from "@/schemas/form-upload";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { getDatabase } from "@/server/database";
import { deleteDocument } from "@/server/file-catalog";
import { getFileStore } from "@/server/files";
import { jsonNoStore } from "@/server/http";

const paymentSchema = z.object({ paid: z.boolean() });

function disposition(name: string, inline = false) {
  return `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g, "%27")}`;
}

async function handle(request: Request, context: RouteContext<"/api/v1/forms/[id]">) {
  const deleting = request.method === "DELETE";
  if (request.method !== "GET" && request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) return jsonNoStore({}, 403);
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status !== "allowed" || !access.context.actorUuid) return jsonNoStore({}, access.status === "unavailable" ? 503 : 401);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonNoStore({}, 404);
  try {
    if (request.method === "PATCH") {
      const payment = paymentSchema.safeParse(await request.json().catch(() => null));
      if (!payment.success) return jsonNoStore({}, 400);
      const result = await getDatabase().formUpload.updateMany({
        where: { fileUuid: id, file: { createdByUuid: access.context.actorUuid, deletingAt: null } },
        data: payment.data,
      });
      return result.count ? jsonNoStore(payment.data) : jsonNoStore({}, 404);
    }
    const params = new URL(request.url).searchParams;
    if (request.method === "GET" && params.get("result") === "1") {
      const form = await getDatabase().formUpload.findFirst({
        where: { fileUuid: id, file: { createdByUuid: access.context.actorUuid, deletingAt: null } },
        select: { processingJson: true, file: { select: { name: true } } },
      });
      const result = formProcessingResult.safeParse(form?.processingJson).data;
      if (!form || !result || !hasFormResult(result)) return jsonNoStore({}, 404);
      return new Response(formatFormResult(result), { headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": disposition(`${form.file.name}.json`),
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
      } });
    }
    const file = await getDatabase().file.findFirst({
      where: { uuid: id, createdByUuid: access.context.actorUuid, formUpload: { isNot: null }, ...(!deleting && { deletingAt: null }) },
      select: { name: true, status: true, versions: { where: { version: 1 }, select: { seaweedUuid: true } } },
    });
    if (!file?.versions[0]) return jsonNoStore({}, 404);
    if (deleting) {
      const result = await deleteDocument({ uuid: id, expectedStatus: file.status }, access.context.actorUuid);
      return jsonNoStore(result, result.status === "ok" ? 200 : 409);
    }
    const bytes = await getFileStore().get(file.versions[0].seaweedUuid, MAX_FORM_BYTES);
    const mime = formMediaType(file.name);
    const download = params.get("download") === "1";
    const inline = !download && ["application/pdf", "text/plain", "application/json", "image/jpeg", "image/png"].includes(mime);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": inline && mime === "application/json" ? "text/plain" : mime,
      "Content-Disposition": disposition(file.name, inline),
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin",
    } });
  } catch (error) {
    console.error("Form storage request failed", error instanceof Error ? error.name : "unknown");
    return jsonNoStore({}, 503);
  }
}

export { handle as GET, handle as DELETE, handle as PATCH };
