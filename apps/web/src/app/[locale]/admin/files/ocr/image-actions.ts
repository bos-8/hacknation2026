"use server";

import sharp from "sharp";
import { z } from "zod";
import { MAX_FILE_UPLOAD_BYTES } from "@/schemas/file-upload";
import type { ImageOcrResult } from "@/schemas/image-ocr";
import { withAdminSession } from "@/server/auth/admin-action";
import { getDatabase } from "@/server/database";
import { getFileStore } from "@/server/files";
import { getImageOcrConfig, ImageOcrProviderError, recognizeImageText } from "@/server/image-ocr";

const active = new Set<string>();

/** Authorize each call and read the upload time from the exact stored revision. */
export async function recognizePhoto(fileUuid: string, version: number): Promise<ImageOcrResult> {
  return withAdminSession(async (actorUuid): Promise<ImageOcrResult> => {
    if (!z.uuid().safeParse(fileUuid).success || !Number.isSafeInteger(version) || version < 1) return { status: "invalid" };
    if (active.has(actorUuid)) return { status: "busy" };
    active.add(actorUuid);
    try {
      const source = await getDatabase().fileVersion.findFirst({
        where: { fileUuid, version, file: { deletingAt: null } },
        select: { size: true, seaweedUuid: true, createdAt: true, fileName: true, file: { select: { name: true } } },
      });
      if (!source || source.size < BigInt(1) || source.size > BigInt(MAX_FILE_UPLOAD_BYTES) ||
        !/\.(jpe?g|png)$/i.test(source.fileName ?? source.file.name)) return { status: "invalid" };
      const config = getImageOcrConfig();
      const bytes = await getFileStore().get(source.seaweedUuid, MAX_FILE_UPLOAD_BYTES);
      if (BigInt(bytes.byteLength) !== source.size) return { status: "invalid" };
      // Decode fully, bound pixel count and remove metadata before sending image content to the provider.
      let normalized: Buffer;
      try {
        const image = sharp(bytes, { limitInputPixels: 24000000, failOn: "warning", animated: false });
        const metadata = await image.metadata();
        if (!["png", "jpeg"].includes(metadata.format ?? "")) return { status: "invalid" };
        normalized = await image.rotate().png().toBuffer();
        if (normalized.byteLength > MAX_FILE_UPLOAD_BYTES) return { status: "invalid" };
      } catch { return { status: "invalid" }; }
      const result = await recognizeImageText(normalized, "image/png", config);
      const saved = await getDatabase().fileVersion.updateMany({
        where: { fileUuid, version, seaweedUuid: source.seaweedUuid, file: { deletingAt: null } },
        data: { imageOcrText: result.text, imageOcrModel: result.model, imageOcrCompletedAt: new Date() },
      });
      if (saved.count !== 1) return { status: "invalid" };
      return { status: "ok", ...result, uploadedAt: source.createdAt.toISOString() };
    } catch (error) {
      return { status: error instanceof ImageOcrProviderError ? error.status : "unavailable" };
    } finally { active.delete(actorUuid); }
  });
}
