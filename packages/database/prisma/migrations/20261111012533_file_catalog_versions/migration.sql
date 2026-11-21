BEGIN;

-- CreateTable
CREATE TABLE "file" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "file_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "file_version" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "file_uuid" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "seaweed_uuid" UUID NOT NULL,
    "size" BIGINT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_version_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "tag" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "file_tag" (
    "file_uuid" UUID NOT NULL,
    "tag_uuid" UUID NOT NULL,

    CONSTRAINT "file_tag_pkey" PRIMARY KEY ("file_uuid","tag_uuid")
);

-- CreateIndex
CREATE INDEX "file_created_by_idx" ON "file"("created_by");

-- CreateIndex
CREATE INDEX "file_updated_by_idx" ON "file"("updated_by");

-- CreateIndex
CREATE UNIQUE INDEX "file_version_seaweed_uuid_key" ON "file_version"("seaweed_uuid");

-- CreateIndex
CREATE INDEX "file_version_created_by_idx" ON "file_version"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "file_version_file_uuid_version_key" ON "file_version"("file_uuid", "version");

-- CreateIndex
CREATE UNIQUE INDEX "tag_name_key" ON "tag"("name");

-- CreateIndex
CREATE INDEX "tag_created_by_idx" ON "tag"("created_by");

-- CreateIndex
CREATE INDEX "tag_updated_by_idx" ON "tag"("updated_by");

-- CreateIndex
CREATE INDEX "file_tag_tag_uuid_idx" ON "file_tag"("tag_uuid");

-- AddForeignKey
ALTER TABLE "file" ADD CONSTRAINT "file_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file" ADD CONSTRAINT "file_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_version" ADD CONSTRAINT "file_version_file_uuid_fkey" FOREIGN KEY ("file_uuid") REFERENCES "file"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_version" ADD CONSTRAINT "file_version_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag" ADD CONSTRAINT "tag_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag" ADD CONSTRAINT "tag_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_tag" ADD CONSTRAINT "file_tag_file_uuid_fkey" FOREIGN KEY ("file_uuid") REFERENCES "file"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_tag" ADD CONSTRAINT "file_tag_tag_uuid_fkey" FOREIGN KEY ("tag_uuid") REFERENCES "tag"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- Check file revision bounds
ALTER TABLE "file_version" ADD CONSTRAINT "file_version_number_check" CHECK ("version" > 0);
ALTER TABLE "file_version" ADD CONSTRAINT "file_version_size_check" CHECK ("size" >= 0);

COMMIT;
