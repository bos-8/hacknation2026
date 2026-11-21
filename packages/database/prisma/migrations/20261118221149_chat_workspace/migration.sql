-- CreateEnum
CREATE TYPE "ChatMode" AS ENUM ('instant', 'thinking');

-- CreateEnum
CREATE TYPE "ChatMessageRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "chat_conversation" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "owner_uuid" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "mode" "ChatMode" NOT NULL DEFAULT 'instant',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chat_conversation_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "chat_message" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "request_uuid" UUID,
    "conversation_uuid" UUID NOT NULL,
    "role" "ChatMessageRole" NOT NULL,
    "mode" "ChatMode" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "chat_attachment" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "message_uuid" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,

    CONSTRAINT "chat_attachment_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "chat_conversation_owner_uuid_updated_at_uuid_idx" ON "chat_conversation"("owner_uuid", "updated_at" DESC, "uuid" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "chat_message_request_uuid_key" ON "chat_message"("request_uuid");

-- CreateIndex
CREATE INDEX "chat_message_conversation_uuid_uuid_idx" ON "chat_message"("conversation_uuid", "uuid");

-- CreateIndex
CREATE INDEX "chat_attachment_message_uuid_idx" ON "chat_attachment"("message_uuid");

-- AddForeignKey
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_owner_uuid_fkey" FOREIGN KEY ("owner_uuid") REFERENCES "user"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_conversation_uuid_fkey" FOREIGN KEY ("conversation_uuid") REFERENCES "chat_conversation"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_attachment" ADD CONSTRAINT "chat_attachment_message_uuid_fkey" FOREIGN KEY ("message_uuid") REFERENCES "chat_message"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

