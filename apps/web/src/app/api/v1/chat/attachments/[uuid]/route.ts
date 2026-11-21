import { z } from "zod";
import { LOGGED_ACCESS } from "@/schemas/access";
import { getAccess } from "@/server/auth/access";
import { readChatAttachment } from "@/server/chat";

export async function GET(_request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin", Vary: "Cookie" };
  const { uuid } = await params;
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status !== "allowed" || !access.context.actorUuid)
    return new Response(null, { status: access.status === "unavailable" ? 503 : 401, headers });
  if (!z.uuid().safeParse(uuid).success) return new Response(null, { status: 404, headers });
  try {
    const file = await readChatAttachment(access.context.actorUuid, uuid);
    if (!file) return new Response(null, { status: 404, headers });
    const name = encodeURIComponent(file.name).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(new Uint8Array(file.content), { headers: { ...headers, "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${name}` } });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
