-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('ROOT', 'SADMIN', 'ADMIN', 'SYSTEM', 'AUDITOR', 'VIEWER', 'USER', 'GUEST');

-- CreateTable
CREATE TABLE "system" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "role" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "code" "RoleCode" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_key_key" ON "system"("key");

-- CreateIndex
CREATE UNIQUE INDEX "role_code_key" ON "role"("code");
