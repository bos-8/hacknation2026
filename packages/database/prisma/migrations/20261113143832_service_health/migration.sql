-- CreateEnum
CREATE TYPE "MonitoredService" AS ENUM ('web', 'backend', 'database', 'keycloak', 'storage', 'queue_worker', 'pyworker');

-- CreateEnum
CREATE TYPE "ServiceHealth" AS ENUM ('healthy', 'degraded', 'error', 'unconfigured');

-- CreateTable
CREATE TABLE "service_health_sample" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "service" "MonitoredService" NOT NULL,
    "status" "ServiceHealth" NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response_ms" INTEGER,
    "http_status" INTEGER,
    "reason" VARCHAR(40) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_health_sample_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "service_health_sample_checked_at_idx" ON "service_health_sample"("checked_at");

-- CreateIndex
CREATE INDEX "service_health_sample_expires_at_idx" ON "service_health_sample"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "service_health_sample_service_checked_at_key" ON "service_health_sample"("service", "checked_at");
