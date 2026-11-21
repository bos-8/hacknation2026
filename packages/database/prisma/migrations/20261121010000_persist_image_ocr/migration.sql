ALTER TABLE "file_version"
  ADD COLUMN "image_ocr_text" TEXT,
  ADD COLUMN "image_ocr_model" TEXT,
  ADD COLUMN "image_ocr_completed_at" TIMESTAMPTZ(3);

ALTER TABLE "file_version" ADD CONSTRAINT "file_version_image_ocr_complete"
  CHECK (
    ("image_ocr_text" IS NULL AND "image_ocr_model" IS NULL AND "image_ocr_completed_at" IS NULL)
    OR
    ("image_ocr_text" IS NOT NULL AND "image_ocr_model" IS NOT NULL AND "image_ocr_completed_at" IS NOT NULL)
  );
