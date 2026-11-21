import { z } from "zod";
import { getAccess } from "@/server/auth/access";
import { ADMIN_ACCESS } from "@/schemas/access";
import { getDatabase } from "@/server/database";

/** Private bounded history, including snapshots of entities already deleted. */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
  const access = await getAccess(ADMIN_ACCESS);
  if (access.status !== "allowed") return new Response(null, { status: access.status === "unauthenticated" ? 401 : access.status === "unavailable" ? 503 : 403, headers });
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = z.object({ entity: z.enum(["product", "file", "file_version"]), uuid: z.uuid(),
    before: z.uuid().optional() }).safeParse(params);
  if (!parsed.success) return new Response(null, { status: 400, headers });
  try {
    const rows = await getDatabase().changeHistory.findMany({
      where: { ...(parsed.data.entity === "file"
        ? { OR: [{ entity: "file", entityUuid: parsed.data.uuid }, { entity: "file_version", parentUuid: parsed.data.uuid }] }
        : { entity: parsed.data.entity, entityUuid: parsed.data.uuid }),
        ...(parsed.data.before ? { uuid: { lt: parsed.data.before } } : {}) },
      orderBy: { uuid: "desc" }, take: 100,
    });
    return Response.json({ rows, next: rows.length === 100 ? rows.at(-1)?.uuid : null }, { headers });
  } catch { return new Response(null, { status: 503, headers }); }
}
