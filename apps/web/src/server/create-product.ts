import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { getDatabase } from "./database.ts";
import { getFileStore } from "./files.ts";
import { PRODUCT_IMAGE_MAX_BYTES, productCreateSchema, type ProductCreateInput, type ProductCreateResult } from "../schemas/product.ts";

/** Decode a static raster image and strip its metadata before storing a bounded WebP. */
export async function normalizeProductImage(bytes: Uint8Array): Promise<Uint8Array> {
  if (!bytes.length || bytes.length > PRODUCT_IMAGE_MAX_BYTES) throw new Error("Invalid product image size");
  const signature = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const png = signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  const webp = signature.toString("ascii", 0, 4) === "RIFF" && signature.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) throw new Error("Invalid product image format");
  const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("Invalid product image format");
  return image.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
}

export async function createProduct(input: ProductCreateInput, actorUuid: string, image?: Uint8Array): Promise<ProductCreateResult> {
  const parsed = productCreateSchema.safeParse({ ...input, description: input.description ?? "" });
  if (!parsed.success || !z.uuid().safeParse(actorUuid).success) return { status: "invalid" };
  let normalized: Uint8Array | undefined;
  if (image) {
    if (image.byteLength > PRODUCT_IMAGE_MAX_BYTES) return { status: "tooLarge" };
    try { normalized = await normalizeProductImage(image); } catch { return { status: "invalidImage" }; }
  }
  const database = getDatabase();
  let attemptedKey: string | undefined;
  let productUuid: string | undefined;
  try {
    const uuid = await database.$transaction(async transaction => {
      let imageFileUuid: string | undefined;
      let objectKey: string | undefined;
      if (normalized) {
        const [object] = await transaction.$queryRaw<{ uuid: string }[]>`SELECT uuidv7()::text AS uuid`;
        objectKey = object.uuid;
        const file = await transaction.file.create({
          data: { name: `${parsed.data.code}.webp`, createdByUuid: actorUuid, updatedByUuid: actorUuid,
            versions: { create: { version: 1, size: BigInt(normalized.byteLength), seaweedUuid: objectKey, createdByUuid: actorUuid } } },
          select: { uuid: true },
        });
        imageFileUuid = file.uuid;
      }
      const product = await transaction.product.create({
        data: { ...parsed.data, createdByUuid: actorUuid, updatedByUuid: actorUuid, imageFileUuid }, select: { uuid: true },
      });
      productUuid = product.uuid;
      if (normalized && objectKey) {
        attemptedKey = objectKey;
        await getFileStore().put(objectKey, normalized);
      }
      return product.uuid;
    }, { timeout: 25000 });
    return { status: "ok", uuid };
  } catch (error) {
    if (productUuid) {
      try {
        // A lost commit response is ambiguous: never delete a committed image.
        if (await database.product.findUnique({ where: { uuid: productUuid }, select: { uuid: true } })) return { status: "ok", uuid: productUuid };
        // Product deletion leaves the image in the independently managed catalog.
        if (attemptedKey && !await database.fileVersion.findUnique({
          where: { seaweedUuid: attemptedKey }, select: { uuid: true },
        })) await getFileStore().remove(attemptedKey);
      } catch { console.error("Product upload recovery could not confirm object cleanup"); }
    }
    return { status: (error as { code?: string }).code === "P2002" ? "duplicate" : "failed" };
  }
}
