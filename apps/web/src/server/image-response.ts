import "server-only";
import { z } from "zod";
import { getAccess } from "./auth/access.ts";
import { ADMIN_ACCESS } from "../schemas/access.ts";
import { PRODUCT_IMAGE_MAX_BYTES } from "../schemas/product.ts";
import { getFileStore } from "./files.ts";
import { normalizeProductImage } from "./create-product.ts";

export async function imageResponse(uuid: string, readVersion: () => Promise<{ seaweedUuid: string; size: bigint } | undefined>): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Vary": "Cookie", "Cross-Origin-Resource-Policy": "same-origin" };
  const error = (status: number) => new Response(null, { status, headers });
  const access = await getAccess(ADMIN_ACCESS);
  if (access.status !== "allowed") return error(access.status === "unauthenticated" ? 401 : access.status === "unavailable" ? 503 : 403);
  if (!z.uuid().safeParse(uuid).success) return error(404);
  try {
    const version = await readVersion();
    if (!version) return error(404);
    if (version.size < BigInt(1) || version.size > BigInt(PRODUCT_IMAGE_MAX_BYTES)) return error(422);
    const bytes = await getFileStore().get(version.seaweedUuid, PRODUCT_IMAGE_MAX_BYTES);
    // A catalog revision may have been uploaded through the generic files flow.
    let normalized: Uint8Array;
    try { normalized = await normalizeProductImage(bytes); }
    catch { return error(415); }
    return new Response(new Uint8Array(normalized), { headers: { ...headers, "Content-Type": "image/webp", "Content-Length": String(normalized.byteLength) } });
  } catch { return error(503); }
}
