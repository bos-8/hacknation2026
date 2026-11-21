import { z } from "zod";
import { getSession } from "@/server/auth/session";
import { getDatabase } from "@/server/database";
import { jsonNoStore } from "@/server/http";

export async function GET(_request: Request, context: RouteContext<"/api/v1/forms/[id]/uploader">) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonNoStore({}, 404);
  try {
    const session = await getSession();
    if (!session || new Date(session.session.expiresAt).getTime() <= Date.now()) return jsonNoStore({}, 401);

    const form = await getDatabase().formUpload.findFirst({
      where: { fileUuid: id, file: { createdByUuid: session.user.id, deletingAt: null } },
      select: { fileUuid: true },
    });
    if (!form) return jsonNoStore({}, 404);

    return jsonNoStore({ name: session.user.name, email: session.user.email });
  } catch {
    return jsonNoStore({}, 503);
  }
}
