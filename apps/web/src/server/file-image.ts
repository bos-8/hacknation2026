import "server-only";
import { getDatabase } from "./database.ts";
import { imageResponse } from "./image-response.ts";
import { parseFileVersion } from "../schemas/file-list.ts";

export async function fileImageResponse(uuid: string, requested: string | null = null): Promise<Response> {
  return imageResponse(uuid, async () => {
    if (requested !== null) {
      const version = parseFileVersion(requested);
      if (!version) return;
      return await getDatabase().fileVersion.findFirst({
        where: { fileUuid: uuid, version, file: { deletingAt: null } },
        select: { seaweedUuid: true, size: true },
      }) ?? undefined;
    }
    const file = await getDatabase().file.findUnique({ where: { uuid, deletingAt: null }, select: {
      versions: { orderBy: { version: "desc" }, take: 1, select: { seaweedUuid: true, size: true } },
    } });
    return file?.versions[0];
  });
}
