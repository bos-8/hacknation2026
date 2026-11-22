import { formFormats } from "@/schemas/form-formats";
import { formMediaType, MAX_FORM_BYTES, validatedFormFile } from "@/schemas/form-upload";
import { LOGGED_ACCESS } from "@/schemas/access";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { createDocument } from "@/server/file-catalog";
import { jsonNoStore } from "@/server/http";
import { pythonEndpoint } from "../../../../../../../scripts/lib/pyworker-client.mjs";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) return jsonNoStore({}, 403);
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status !== "allowed" || !access.context.actorUuid) return jsonNoStore({}, access.status === "unavailable" ? 503 : 401);
  if (request.headers.get("content-type") !== "application/octet-stream") return jsonNoStore({}, 415);
  let name: string;
  try { name = decodeURIComponent(request.headers.get("x-file-name") ?? "").normalize("NFC").trim(); }
  catch { return jsonNoStore({}, 422); }
  if (!name || name.length > 255 || /[\\/\p{Cc}]/u.test(name) ||
      !formFormats.some(format => format.extensions.some(ext => name.toLowerCase().endsWith(ext)))) return jsonNoStore({}, 422);
  const modified = Number(request.headers.get("x-file-modified"));
  const modifiedAt = new Date(modified);
  if (!request.headers.has("x-file-modified") || !Number.isSafeInteger(modified) || !Number.isFinite(modifiedAt.getTime())) return jsonNoStore({}, 422);
  if (Number(request.headers.get("content-length")) > MAX_FORM_BYTES) return jsonNoStore({}, 413);
  const reader = request.body?.getReader();
  if (!reader) return jsonNoStore({}, 422);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FORM_BYTES) {
        await reader.cancel();
        return jsonNoStore({}, 413);
      }
      chunks.push(value);
    }
    if (!size) return jsonNoStore({}, 422);
    const bytes = Buffer.concat(chunks, size);
    const mime = formMediaType(name);
    const body = new FormData();
    body.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), name);
    const { url, headers } = pythonEndpoint(process.env, "/v1/forms/validate");
    const response = await fetch(url, {
      method: "POST", body, headers: { Authorization: headers.Authorization },
      redirect: "error", cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(35000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 415) return jsonNoStore({ error: "format_mismatch" }, 415);
      return jsonNoStore({}, [413, 422, 429].includes(response.status) ? response.status : 503);
    }
    const validated = validatedFormFile.safeParse(await response.json());
    if (!validated.success || validated.data.media_type !== mime || validated.data.size_bytes !== size) {
      return jsonNoStore({}, 502);
    }
    const id = await createDocument(name, bytes, access.context.actorUuid, modifiedAt);
    return jsonNoStore({ id }, 201);
  } catch { return jsonNoStore({}, 503); }
  finally { reader.releaseLock(); }
}
