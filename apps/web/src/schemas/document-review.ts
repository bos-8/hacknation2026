import { z } from "zod";

export const documentExtensions = [".pdf", ".jpg", ".jpeg", ".png"] as const;

export const labels = [
  "",
  "IMIĘ",
  "NAZWISKO",
  "OSOBA",
  "PESEL",
  "NIP",
  "KONTO",
  "EMAIL",
  "TELEFON",
  "ADRES",
  "DANE",
] as const;
const coordinate = z.number().int().min(0).max(12000);
const word = z.object({
  text: z.string().max(500),
  box: z.tuple([coordinate, coordinate, coordinate, coordinate]),
  confidence: z.number().min(0).max(100).nullable().optional(),
  label: z.enum(labels),
});
export const pageSchema = z
  .object({
    width: coordinate.min(1),
    height: coordinate.min(1),
    words: z.array(word).max(5000),
  })
  .refine((p) =>
    p.words.every(
      ({ box: [x, y, r, b] }) =>
        x < r && y < b && r <= p.width && b <= p.height,
    ),
  );
export const pagesSchema = z.array(pageSchema).min(1).max(12);
export type ReviewPage = z.infer<typeof pageSchema>;
export const modeSchema = z.enum(["auto", "manual"]);
export const variantSchema = z.enum(["original", "black", "labels"]);
export type ReviewMode = z.infer<typeof modeSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type StageTiming = {
  queuedAt: Date;
  startedAt: Date | null;
  sampledAt: Date | null;
  estimateMs: number | null;
};

export type RunView = StageTiming & {
  ocrProgress: number | null;
  detector: string | null;
  uuid: string;
  stage: string;
  revision: number;
  pages: ReviewPage[];
  exports: (StageTiming & { uuid: string; variant: string; stage: string; progress: number | null })[];
};
