import "server-only";
import { getDatabase } from "./database.ts";
import { imageResponse } from "./image-response.ts";

export async function productImageResponse(uuid: string): Promise<Response> {
  return imageResponse(uuid, async () => {
    const product = await getDatabase().product.findUnique({ where: { uuid }, select: {
      imageFile: { select: { versions: { orderBy: { version: "desc" }, take: 1, select: { seaweedUuid: true, size: true } } } },
    } });
    return product?.imageFile?.versions[0];
  });
}
