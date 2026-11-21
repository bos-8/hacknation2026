import { Suspense, type ReactNode } from "react";
import { LOGGED_ACCESS } from "@/schemas/access";
import { requireAccess } from "@/server/auth/access";
import { Throbber } from "@/ui/basic";

async function ChatBoundary({ children }: { children: ReactNode }) {
  await requireAccess(LOGGED_ACCESS);
  return children;
}

export default function ChatLayout({ children }: LayoutProps<"/[locale]/chat">) {
  return <Suspense fallback={<div className="flex justify-center p-8"><Throbber /></div>}>
    <ChatBoundary>{children}</ChatBoundary>
  </Suspense>;
}
