-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'inactive', 'pending_archiving', 'archived', 'pending_deletion', 'softdelete');

-- CreateTable
CREATE TABLE "product" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'active',
    "price" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'PLN',
    "image_file_uuid" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "last_archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "product_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_code_key" ON "product"("code");

-- CreateIndex
CREATE INDEX "product_created_by_idx" ON "product"("created_by");

-- CreateIndex
CREATE INDEX "product_updated_by_idx" ON "product"("updated_by");

-- CreateIndex
CREATE INDEX "product_image_file_uuid_idx" ON "product"("image_file_uuid");

-- CreateIndex
CREATE INDEX "product_status_uuid_idx" ON "product"("status", "uuid");

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_image_file_uuid_fkey" FOREIGN KEY ("image_file_uuid") REFERENCES "file"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
