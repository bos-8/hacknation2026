import { z } from "zod";
import { withAdminSession } from "@/server/auth/admin-action";
import { getDatabase } from "@/server/database";
import { pageSchema } from "@/schemas/document-review";
import { redactedPreview } from "@/server/redacted-preview";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ uuid: string; page: string }> },
) {
  const { uuid, page } = await params;
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (!z.uuid().safeParse(uuid).success || !/^(?:[0-9]|1[01])$/.test(page))
    return new Response(null, { status: 404, headers });
  const query = new URL(request.url).searchParams;
  const variant = query.get("variant");
  const rev = query.get("revision");
  if ((variant !== null && (!["black", "labels"].includes(variant) || rev === null)) ||
      (rev !== null && !/^\d{1,9}$/.test(rev))) return new Response(null, { status: 404, headers });
  const result = await withAdminSession(async (actorUuid) => {
    const records = await getDatabase().$queryRaw<{ image: Uint8Array | null; metadata: unknown }[]>`
      SELECT a.previews[${Number(page) + 1}::int] AS image,
        CASE WHEN ${variant}::text IS NOT NULL THEN a.pages -> ${Number(page)}::int END AS metadata FROM document_analysis a
      JOIN file_version v ON v.uuid=a."sourceUuid" JOIN "file" f ON f.uuid=v.file_uuid
      WHERE a.uuid=${uuid}::uuid AND a."actorUuid"=${actorUuid}::uuid AND f.deleting_at IS NULL
        AND (${rev}::int IS NULL OR a.revision=${rev}::int)
        AND (${variant}::text IS NULL OR a.stage IN ('review','approved'))`;
    const image = records[0]?.image;
    if (image && variant) {
      const sanitized = await redactedPreview(image, pageSchema.parse(records[0].metadata), variant === "labels");
      return new Response(new Uint8Array(sanitized), { headers: { ...headers, "Content-Type": "image/png" } });
    }
    return image
      ? new Response(new Uint8Array(image), { headers: { ...headers, "Content-Type": "image/jpeg" } })
      : new Response(null, { status: 404, headers });
  });
  return result instanceof Response ? result : new Response(null, { status: 403, headers });
}
