-- CreateTable
CREATE TABLE "llm_settings" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "key" VARCHAR(32) NOT NULL,
    "active_prompt_uuid" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "llm_settings_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "llm_prompt_version" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "settings_uuid" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "llm_prompt_version_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_settings_key_key" ON "llm_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "llm_settings_active_prompt_uuid_key" ON "llm_settings"("active_prompt_uuid");

-- CreateIndex
CREATE INDEX "llm_settings_updated_by_idx" ON "llm_settings"("updated_by");

-- CreateIndex
CREATE INDEX "llm_prompt_version_created_by_idx" ON "llm_prompt_version"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "llm_prompt_version_settings_uuid_version_key" ON "llm_prompt_version"("settings_uuid", "version");

-- AddForeignKey
ALTER TABLE "llm_settings" ADD CONSTRAINT "llm_settings_active_prompt_uuid_fkey" FOREIGN KEY ("active_prompt_uuid") REFERENCES "llm_prompt_version"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_settings" ADD CONSTRAINT "llm_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_prompt_version" ADD CONSTRAINT "llm_prompt_version_settings_uuid_fkey" FOREIGN KEY ("settings_uuid") REFERENCES "llm_settings"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_prompt_version" ADD CONSTRAINT "llm_prompt_version_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- One settings record and a required foreign key hold the active prompt.
ALTER TABLE "llm_settings" ADD CONSTRAINT "llm_settings_chat_key_check" CHECK ("key" = 'chat');

WITH ids AS (
  SELECT uuidv7() AS settings_uuid, uuidv7() AS prompt_uuid
), settings AS (
  INSERT INTO "llm_settings" ("uuid", "key", "active_prompt_uuid", "updated_at")
  SELECT settings_uuid, 'chat', prompt_uuid, CURRENT_TIMESTAMP FROM ids
  RETURNING "uuid", "active_prompt_uuid"
)
INSERT INTO "llm_prompt_version" ("uuid", "settings_uuid", "version", "system_prompt")
SELECT "active_prompt_uuid", "uuid", 1,
  'You are the Modulon assistant. Answer clearly in the user''s language. If you are unsure, say so.'
FROM settings;
