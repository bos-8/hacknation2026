-- CreateEnum
CREATE TYPE "TagStatus" AS ENUM ('active', 'inactive', 'pending_archiving', 'archived', 'pending_deletion', 'softdelete');

-- AlterTable
ALTER TABLE "tag" ADD COLUMN     "status" "TagStatus" NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE INDEX "tag_status_uuid_idx" ON "tag"("status", "uuid");
