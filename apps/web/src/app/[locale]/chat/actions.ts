"use server";

import { z } from "zod";
import { LOGGED_ACCESS } from "@/schemas/access";
import { chatTitleSchema } from "@/schemas/chat";
import { withAccess } from "@/server/auth/access";
import { listChats, readChat, renameChat } from "@/server/chat";

function withChatOwner<T>(run: (owner: string) => Promise<T>) {
  return withAccess(LOGGED_ACCESS, async ({ actorUuid }) => {
    if (!actorUuid) return { status: "denied" as const };
    try { return await run(actorUuid); } catch { return { status: "failed" as const }; }
  });
}

export async function loadChatHistory(offset: number) {
  return withChatOwner(async owner => {
    if (!z.number().int().min(0).max(30000).safeParse(offset).success) return { status: "invalid" as const };
    return { status: "ok" as const, ...await listChats(owner, offset) };
  });
}

export async function openChat(uuid: string) {
  return withChatOwner(async owner => {
    if (!z.uuid().safeParse(uuid).success) return { status: "invalid" as const };
    const chat = await readChat(owner, uuid);
    return chat ? { status: "ok" as const, chat } : { status: "missing" as const };
  });
}

export async function saveChatTitle(uuid: string, value: string) {
  return withChatOwner(async owner => {
    const title = chatTitleSchema.safeParse(value);
    if (!z.uuid().safeParse(uuid).success || !title.success) return { status: "invalid" as const };
    const chat = await renameChat(owner, uuid, title.data);
    return chat ? { status: "ok" as const, chat } : { status: "missing" as const };
  });
}
