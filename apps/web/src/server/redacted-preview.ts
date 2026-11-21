import "server-only";
import sharp from "sharp";
import type { ReviewPage } from "@/schemas/document-review";

/** Burn the review boxes into a fresh raster. Only validated field labels enter the SVG. */
export async function redactedPreview(image: Uint8Array, page: ReviewPage, labels: boolean) {
  const { width, height } = await sharp(image).metadata();
  const sx = width / page.width, sy = height / page.height;
  const masks = page.words.filter(word => word.label).map(({ box, label }) => {
    const [x, y, r, b] = box;
    const left = Math.max(0, Math.floor((x - 2) * sx)), top = Math.max(0, Math.floor((y - 2) * sy));
    const w = Math.ceil((r + 2) * sx) - left, h = Math.ceil((b + 2) * sy) - top;
    const font = Math.min(h * 0.8, w / (label.length + 2));
    return `<rect x="${left}" y="${top}" width="${w}" height="${h}"/>` +
      (labels ? `<text x="${left + w/2}" y="${top + h/2 + font/3}" text-anchor="middle" font-family="sans-serif" font-size="${font}" fill="white">[${label}]</text>` : "");
  });
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${masks.join("")}</svg>`);
  return sharp(image).composite([{ input: overlay }]).png().toBuffer();
}
