import { Suspense, type ReactNode } from "react";
import { getSession } from "@/server/auth/session";
import { requireAccess } from "@/server/auth/access";
import { LOGGED_ACCESS } from "@/schemas/access";
import { FormsProvider } from "./workspace";

export const instant = false;

async function PrivateForms({ children }: { children: ReactNode }) {
  const access = await requireAccess(LOGGED_ACCESS);
  const session = await getSession();
  return <FormsProvider key={access.actorUuid} uploader={session?.user.name || session?.user.email || access.actorUuid || "—"}>{children}</FormsProvider>;
}

export default function FormsLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}><PrivateForms>{children}</PrivateForms></Suspense>;
}
