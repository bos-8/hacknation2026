ALTER TABLE document_analysis ADD COLUMN detector TEXT, ADD COLUMN "rerunPage" INTEGER;
CREATE TABLE document_approval (
    "analysisUuid" UUID NOT NULL REFERENCES document_analysis(uuid) ON DELETE CASCADE ON UPDATE CASCADE,
    revision INTEGER NOT NULL,
    stage TEXT NOT NULL,
    pages JSONB NOT NULL,
    "actorUuid" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("analysisUuid", revision)
);
