CREATE TYPE "FileStatus" AS ENUM ('active', 'inactive', 'pending_deletion', 'softdelete', 'pending_archiving');

ALTER TABLE "file" ADD COLUMN "status" "FileStatus" NOT NULL DEFAULT 'active';
