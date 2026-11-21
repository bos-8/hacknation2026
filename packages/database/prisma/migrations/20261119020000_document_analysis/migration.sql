-- CreateTable
CREATE TABLE "document_analysis" (
    "dispatched" BOOLEAN NOT NULL DEFAULT false,
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "sourceUuid" UUID NOT NULL,
    "actorUuid" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'ocr',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "ticket" UUID NOT NULL DEFAULT uuidv7(),
    "previews" BYTEA[] DEFAULT ARRAY[]::BYTEA[],
    "originalPages" JSONB NOT NULL DEFAULT '[]',
    "pages" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "document_analysis_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "document_export" (
    "dispatched" BOOLEAN NOT NULL DEFAULT false,
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "analysisUuid" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "variant" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "ticket" UUID NOT NULL DEFAULT uuidv7(),

    CONSTRAINT "document_export_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_analysis_ticket_key" ON "document_analysis"("ticket");

-- CreateIndex
CREATE INDEX "document_analysis_stage_idx" ON "document_analysis"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "document_analysis_sourceUuid_actorUuid_mode_key" ON "document_analysis"("sourceUuid", "actorUuid", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "document_export_ticket_key" ON "document_export"("ticket");

-- CreateIndex
CREATE INDEX "document_export_stage_idx" ON "document_export"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "document_export_analysisUuid_revision_variant_key" ON "document_export"("analysisUuid", "revision", "variant");

-- AddForeignKey
ALTER TABLE "document_analysis" ADD CONSTRAINT "document_analysis_sourceUuid_fkey" FOREIGN KEY ("sourceUuid") REFERENCES "file_version"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_export" ADD CONSTRAINT "document_export_analysisUuid_fkey" FOREIGN KEY ("analysisUuid") REFERENCES "document_analysis"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

