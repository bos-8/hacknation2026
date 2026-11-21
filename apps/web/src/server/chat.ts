import "server-only";
import { getDatabase } from "./database.ts";
import { chatGenerationSchema, chatHistoryPageSize, type ChatGeneration, type ChatMode } from "../schemas/chat.ts";

const summary = { uuid: true, title: true, mode: true, updatedAt: true } as const;
const message = { uuid: true, role: true, mode: true, content: true, createdAt: true,
  attachments: { orderBy: { uuid: "asc" as const }, select: { uuid: true, name: true, size: true } } } as const;
const messageWithGeneration = { ...message, generation: true } as const;
const maxMessages = 100;
const maxConversationBytes = 32 * 1024 * 1024;

export async function listChats(ownerUuid: string, offset = 0) {
  const rows = await getDatabase().chatConversation.findMany({
    where: { ownerUuid }, orderBy: [{ updatedAt: "desc" }, { uuid: "desc" }],
    skip: offset, take: chatHistoryPageSize + 1, select: summary,
  });
  return { rows: rows.slice(0, chatHistoryPageSize), more: rows.length > chatHistoryPageSize };
}

function parseGeneration<T extends { generation: unknown }>(row: T) {
  return { ...row, generation: chatGenerationSchema.safeParse(row.generation).data ?? null };
}

export async function readChat(ownerUuid: string, uuid: string) {
  const chat = await getDatabase().chatConversation.findFirst({
    where: { uuid, ownerUuid }, select: { ...summary,
      messages: { orderBy: { uuid: "asc" }, take: maxMessages, select: messageWithGeneration } },
  });
  return chat && { ...chat, messages: chat.messages.map(parseGeneration) };
}

export async function renameChat(ownerUuid: string, uuid: string, title: string) {
  return await getDatabase().chatConversation.updateManyAndReturn({ where: { uuid, ownerUuid },
    data: { title }, select: summary }).then(rows => rows[0] ?? null);
}

export function readChatAttachment(ownerUuid: string, uuid: string) {
  return getDatabase().chatAttachment.findFirst({
    where: { uuid, message: { conversation: { ownerUuid } } },
    select: { name: true, content: true },
  });
}

type Draft = {
  uuid?: string; requestUuid: string; content: string; mode: ChatMode;
  attachments: { name: string; size: number; content: Uint8Array<ArrayBuffer> }[];
};

export async function appendChatMessage(ownerUuid: string, draft: Draft) {
  const db = getDatabase();
  const replay = async () => {
    const saved = await db.chatMessage.findFirst({
      where: { requestUuid: draft.requestUuid, role: "user", conversation: { ownerUuid },
        ...(draft.uuid ? { conversationUuid: draft.uuid } : {}) },
      select: { ...message, conversation: { select: summary } },
    });
    if (!saved) return null;
    const { conversation, ...entry } = saved;
    return { status: "ok" as const, conversation, entry };
  };
  const saved = await replay();
  if (saved) return saved;
  try {
    return await db.$transaction(async tx => {
      let conversation;
      if (draft.uuid) {
        // Serialize append/rename for one owner before counting messages and attachments.
        const [locked] = await tx.$queryRaw<{ uuid: string }[]>`
          SELECT uuid FROM chat_conversation WHERE uuid = ${draft.uuid}::uuid AND owner_uuid = ${ownerUuid}::uuid FOR UPDATE
        `;
        if (!locked) return { status: "missing" as const };
        const duplicate = await tx.chatMessage.findUnique({ where: { requestUuid: draft.requestUuid },
          select: { ...message, conversation: { select: summary } } });
        if (duplicate?.conversation.uuid === locked.uuid) {
          const { conversation, ...entry } = duplicate;
          return { status: "ok" as const, conversation, entry };
        }
        const count = await tx.chatMessage.count({ where: { conversationUuid: locked.uuid } });
        if (count > maxMessages - 2) return { status: "limit" as const };
        if (draft.attachments.length) {
          const stored = await tx.chatAttachment.aggregate({ where: { message: { conversationUuid: locked.uuid } }, _sum: { size: true } });
          if ((stored._sum.size ?? 0) + draft.attachments.reduce((sum, file) => sum + file.size, 0) > maxConversationBytes)
            return { status: "limit" as const };
        }
        conversation = await tx.chatConversation.update({ where: { uuid: locked.uuid }, data: { mode: draft.mode }, select: summary });
      } else {
        const firstLine = draft.content.split("\n", 1)[0] || draft.attachments[0].name;
        const title = Array.from(firstLine).slice(0, 60).join("");
        conversation = await tx.chatConversation.create({ data: { ownerUuid, title, mode: draft.mode }, select: summary });
      }
      const entry = await tx.chatMessage.create({
        data: { conversationUuid: conversation.uuid, requestUuid: draft.requestUuid, content: draft.content,
          role: "user", mode: draft.mode, attachments: { create: draft.attachments } },
        select: message,
      });
      return { status: "ok" as const, conversation, entry };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const retried = await replay();
      if (retried) return retried;
    }
    throw error;
  }
}

export async function readChatReply(conversationUuid: string, userMessageUuid: string) {
  const reply = await getDatabase().chatMessage.findUnique({
    where: { requestUuid: userMessageUuid, conversationUuid, role: "assistant" }, select: messageWithGeneration,
  });
  return reply && parseGeneration(reply);
}

export function readChatContext(conversationUuid: string, through: string) {
  return getDatabase().chatMessage.findMany({
    where: { conversationUuid, uuid: { lte: through } }, orderBy: { uuid: "asc" }, take: maxMessages,
    select: { role: true, content: true,
      attachments: { orderBy: { uuid: "asc" }, select: { name: true, content: true } } },
  });
}

export async function saveChatReply(
  conversationUuid: string, userMessageUuid: string, mode: ChatMode, content: string, generation: ChatGeneration,
) {
  // Client submission IDs are v4. A reply uses the database-generated v7 ID of its user message.
  const reply = await getDatabase().chatMessage.upsert({
    where: { requestUuid: userMessageUuid, conversationUuid, role: "assistant" }, update: {},
    create: { conversationUuid, requestUuid: userMessageUuid, role: "assistant", mode, content, generation },
    select: messageWithGeneration,
  });
  return parseGeneration(reply);
}
