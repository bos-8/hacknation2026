import "server-only";
import { z } from "zod";
import { getDatabase } from "./database.ts";
import { PRODUCT_IMAGE_MAX_BYTES, productEditSchema, type ProductEditInput, type ProductEditResult } from "../schemas/product.ts";
import { normalizeProductImage } from "./create-product.ts";
import { getFileStore } from "./files.ts";
import { productDeleteSchema, productStatusChangeSchema, type ProductDelete, type ProductStatusChange, type ProductStatusResult } from "../schemas/product-status.ts";

export async function editProduct(input: ProductEditInput, actorUuid: string, image?: Uint8Array): Promise<ProductEditResult> {
  const parsed = productEditSchema.safeParse({ ...input, description: input.description ?? "" });
  if (!parsed.success || !z.uuid().safeParse(actorUuid).success) return { status: "invalid" };
  const { uuid, expectedUpdatedAt, ...data } = parsed.data;
  let normalized: Uint8Array | undefined;
  if (image) {
    if (image.byteLength > PRODUCT_IMAGE_MAX_BYTES) return { status: "tooLarge" };
    try { normalized = await normalizeProductImage(image); } catch { return { status: "invalidImage" }; }
  }
  const database = getDatabase();
  let attemptedKey: string | undefined;
  let imageFileUuid: string | undefined;
  try {
    const update = { where: { uuid, updatedAt: new Date(expectedUpdatedAt) }, data: { ...data, updatedByUuid: actorUuid } };
    if (!normalized) {
      const result = await database.product.updateMany(update);
      return result.count === 1 ? { status: "ok", uuid } : { status: "conflict" };
    }
    const bytes = normalized;
    return await database.$transaction(async transaction => {
      // The conditional update acquires the product lock before creating storage metadata.
      const changed = await transaction.product.updateMany(update);
      if (changed.count !== 1) return { status: "conflict" as const };
      const [object] = await transaction.$queryRaw<{ uuid: string }[]>`SELECT uuidv7()::text AS uuid`;
      const file = await transaction.file.create({ data: {
        name: `${data.code}.webp`, createdByUuid: actorUuid, updatedByUuid: actorUuid,
        versions: { create: { version: 1, size: BigInt(bytes.byteLength), seaweedUuid: object.uuid, createdByUuid: actorUuid } },
      }, select: { uuid: true } });
      imageFileUuid = file.uuid;
      await transaction.product.update({ where: { uuid }, data: { imageFileUuid: file.uuid }, select: { uuid: true } });
      attemptedKey = object.uuid;
      await getFileStore().put(object.uuid, bytes);
      return { status: "ok" as const, uuid };
    }, { timeout: 25000 });
  } catch (error) {
    if (attemptedKey && imageFileUuid) {
      try {
        // A lost commit response is ambiguous. Preserve any committed version object,
        // including when a later product edit has already replaced its image again.
        const version = await database.fileVersion.findUnique({ where: { seaweedUuid: attemptedKey }, select: { uuid: true } });
        if (version) {
          const product = await database.product.findUnique({ where: { uuid }, select: { imageFileUuid: true } });
          return product?.imageFileUuid === imageFileUuid ? { status: "ok", uuid } : { status: "conflict" };
        }
        await getFileStore().remove(attemptedKey);
      } catch { console.error("Product image recovery could not confirm object cleanup"); }
    }
    return { status: (error as { code?: string }).code === "P2002" ? "duplicate" : "failed" };
  }
}

export async function updateProductStatus(input: ProductStatusChange, actorUuid: string): Promise<ProductStatusResult> {
  const parsed = productStatusChangeSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(actorUuid).success) return { status: "invalid" };
  const { uuid, expectedStatus, status } = parsed.data;
  const result = await getDatabase().product.updateMany({
    where: { uuid, status: expectedStatus }, data: { status, updatedByUuid: actorUuid },
  });
  return { status: result.count === 1 ? "ok" : "conflict" };
}

export async function deleteProduct(input: ProductDelete, actorUuid: string): Promise<ProductStatusResult> {
  const parsed = productDeleteSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(actorUuid).success) return { status: "invalid" };
  const { uuid, expectedStatus, expectedUpdatedAt } = parsed.data;
  // Delete only the product. Its optional image remains a separately managed file.
  const result = await getDatabase().$transaction(async transaction => {
    await transaction.$executeRaw`SELECT set_config('app.actor_uuid', ${actorUuid}, true)`;
    return transaction.product.deleteMany({ where: { uuid, status: expectedStatus, updatedAt: new Date(expectedUpdatedAt) } });
  });
  return { status: result.count === 1 ? "ok" : "conflict" };
}
