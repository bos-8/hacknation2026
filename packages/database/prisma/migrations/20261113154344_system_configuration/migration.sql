-- CreateEnum
CREATE TYPE "SystemConfigStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "system" ADD COLUMN     "active_config_uuid" UUID;

-- CreateTable
CREATE TABLE "system_config_version" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "system_uuid" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',
    "status" "SystemConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "monitoring_interval_seconds" INTEGER NOT NULL DEFAULT 60,
    "cleanup_interval_seconds" INTEGER NOT NULL DEFAULT 60,
    "history_retention_days" INTEGER NOT NULL DEFAULT 7,
    "queue_retry_limit" INTEGER NOT NULL DEFAULT 3,
    "slow_response_ms" INTEGER NOT NULL DEFAULT 1500,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "published_by" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "archived_by" UUID,

    CONSTRAINT "system_config_version_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "system_config_activation" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "system_uuid" UUID NOT NULL,
    "config_uuid" UUID NOT NULL,
    "previous_config_uuid" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "system_config_activation_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "system_config_worker" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "worker_key" VARCHAR(120) NOT NULL,
    "applied_config_uuid" UUID,
    "applied_at" TIMESTAMPTZ(3),
    "heartbeat_at" TIMESTAMPTZ(3) NOT NULL,
    "error_code" VARCHAR(40),

    CONSTRAINT "system_config_worker_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "system_config_version_system_uuid_created_at_idx" ON "system_config_version"("system_uuid", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_version_system_uuid_version_key" ON "system_config_version"("system_uuid", "version");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_version_system_uuid_uuid_key" ON "system_config_version"("system_uuid", "uuid");

-- CreateIndex
CREATE INDEX "system_config_activation_system_uuid_created_at_idx" ON "system_config_activation"("system_uuid", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_worker_worker_key_key" ON "system_config_worker"("worker_key");

-- CreateIndex
CREATE UNIQUE INDEX "system_active_config_uuid_key" ON "system"("active_config_uuid");

-- AddForeignKey
ALTER TABLE "system" ADD CONSTRAINT "system_active_config_uuid_fkey" FOREIGN KEY ("active_config_uuid") REFERENCES "system_config_version"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config_version" ADD CONSTRAINT "system_config_version_system_uuid_fkey" FOREIGN KEY ("system_uuid") REFERENCES "system"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config_version" ADD CONSTRAINT "system_config_version_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config_version" ADD CONSTRAINT "system_config_version_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config_version" ADD CONSTRAINT "system_config_version_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config_version" ADD CONSTRAINT "system_config_version_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config_activation" ADD CONSTRAINT "system_config_activation_system_uuid_fkey" FOREIGN KEY ("system_uuid") REFERENCES "system"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config_activation" ADD CONSTRAINT "system_config_activation_config_uuid_fkey" FOREIGN KEY ("config_uuid") REFERENCES "system_config_version"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config_activation" ADD CONSTRAINT "system_config_activation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config_worker" ADD CONSTRAINT "system_config_worker_applied_config_uuid_fkey" FOREIGN KEY ("applied_config_uuid") REFERENCES "system_config_version"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense in depth: validate persisted values and lifecycle audit pairs.
ALTER TABLE system_config_version ADD CONSTRAINT system_config_settings_valid CHECK (
 monitoring_interval_seconds IN (60,120,180,240,300,600,900,1200,1800,3600)
 AND cleanup_interval_seconds IN (60,120,180,240,300,600,900,1200,1800,3600)
 AND history_retention_days BETWEEN 1 AND 7 AND queue_retry_limit BETWEEN 0 AND 10
 AND slow_response_ms BETWEEN 100 AND 5000 AND version > 0 AND length(trim(name)) > 0
 AND ((published_at IS NULL) = (published_by IS NULL))
 AND ((archived_at IS NULL) = (archived_by IS NULL))
 AND (status <> 'PUBLISHED' OR published_at IS NOT NULL)
 AND (status <> 'ARCHIVED' OR archived_at IS NOT NULL)
 AND (status <> 'DRAFT' OR (published_at IS NULL AND archived_at IS NULL))
 AND (status <> 'PUBLISHED' OR archived_at IS NULL)
);
CREATE FUNCTION validate_active_system_config() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.active_config_uuid IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM system_config_version WHERE uuid = NEW.active_config_uuid AND system_uuid = NEW.uuid AND status = 'PUBLISHED'
 ) THEN RAISE EXCEPTION 'Active configuration must be published and belong to this system'; END IF;
 IF TG_OP = 'UPDATE' AND OLD.active_config_uuid IS NOT NULL AND NEW.active_config_uuid IS NULL THEN
  RAISE EXCEPTION 'An initialized system must retain an active configuration';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER system_active_config_guard BEFORE INSERT OR UPDATE OF active_config_uuid ON system
 FOR EACH ROW EXECUTE FUNCTION validate_active_system_config();
CREATE FUNCTION protect_system_config_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.uuid,NEW.system_uuid,NEW.version,NEW.created_at,NEW.created_by)
  IS DISTINCT FROM ROW(OLD.uuid,OLD.system_uuid,OLD.version,OLD.created_at,OLD.created_by) THEN
  RAISE EXCEPTION 'Configuration identity and creation audit are immutable';
 END IF;
 IF OLD.status <> 'DRAFT' AND (
  ROW(NEW.name,NEW.description,NEW.monitoring_interval_seconds,NEW.cleanup_interval_seconds,NEW.history_retention_days,NEW.queue_retry_limit,NEW.slow_response_ms,NEW.published_at,NEW.published_by)
  IS DISTINCT FROM ROW(OLD.name,OLD.description,OLD.monitoring_interval_seconds,OLD.cleanup_interval_seconds,OLD.history_retention_days,OLD.queue_retry_limit,OLD.slow_response_ms,OLD.published_at,OLD.published_by)
  OR NEW.status = 'DRAFT' OR (OLD.status = 'ARCHIVED' AND NEW.status <> 'ARCHIVED')
 ) THEN RAISE EXCEPTION 'Published configuration is immutable; create a draft copy'; END IF;
 IF NEW.status <> 'PUBLISHED' AND EXISTS (SELECT 1 FROM system WHERE active_config_uuid = OLD.uuid) THEN
  RAISE EXCEPTION 'Active configuration cannot be archived';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER system_config_version_guard BEFORE UPDATE ON system_config_version
 FOR EACH ROW EXECUTE FUNCTION protect_system_config_version();
