import { Suspense } from "react";
import { LOGGED_ACCESS } from "@/schemas/access";
import { requireAccess } from "@/server/auth/access";
import { listChats } from "@/server/chat";
import { ChatWorkspace } from "./chat-workspace";

export const instant = false;

async function PrivateChat() {
  const access = await requireAccess(LOGGED_ACCESS);
  const initial = access.actorUuid ? await listChats(access.actorUuid).catch(() => null) : null;
  return <ChatWorkspace initial={initial} />;
}

export default function ChatPage() {
  return <Suspense fallback={null}><PrivateChat /></Suspense>;
}
