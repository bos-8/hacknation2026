import { z } from "zod";
import { formFormats } from "@/schemas/form-formats";
import { LOGGED_ACCESS } from "@/schemas/access";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { jsonNoStore } from "@/server/http";
import { pythonEndpoint } from "../../../../../../../../scripts/lib/pyworker-client.mjs";

const resultSchema = z.object({
  status: z.literal("validated"),
  media_type: z.enum(formFormats.map(format => format.mime)),
  size_bytes: z.number().int().positive().max(20 * 1024 * 1024),
});

export async function POST(request: Request) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) return jsonNoStore({}, 403);
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status === "unavailable") return jsonNoStore({}, 503);
  if (access.status !== "allowed" || !access.context.actorUuid) return jsonNoStore({}, 401);
  const type = request.headers.get("content-type") || "";
  if (!request.body || !/^multipart\/form-data\s*;/i.test(type)) return jsonNoStore({}, 415);
  if (Number(request.headers.get("content-length")) > 20 * 1024 * 1024 + 65536) return jsonNoStore({}, 413);
  try {
    const { url, headers } = pythonEndpoint(process.env, "/v1/forms/validate");
    const options = {
      method: "POST", duplex: "half", body: request.body, redirect: "error",
      headers: { ...headers, "Content-Type": type }, cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(35000)]),
    } as const;
    const response = await fetch(url, options);
    if (!response.ok) {
      await response.body?.cancel();
      return jsonNoStore({}, [408, 413, 415, 422, 429, 503].includes(response.status) ? response.status : 502);
    }
    return jsonNoStore(resultSchema.parse(await response.json()));
  } catch {
    return jsonNoStore({}, 502);
  }
}
