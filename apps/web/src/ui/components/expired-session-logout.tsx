"use client";

import type { SessionStatus } from "@/schemas/session";
import { useSessionLifecycle } from "./use-session-lifecycle";
import { SessionLogoutProgress } from "./session-logout-progress";

/** On a reload after cookie expiry, finish provider logout before showing sign-in. */
export function ExpiredSessionLogout({ initial }: { initial: SessionStatus }) {
  const session = useSessionLifecycle(initial, false, true);
  return <SessionLogoutProgress onReady={session.logoutProgressReady} />;
}
