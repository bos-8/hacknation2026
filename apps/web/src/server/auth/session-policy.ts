import "server-only";
import type { AuthConfig } from "./config.ts";

export type SessionRecord = { uuid: string; expiresAt: Date; renewalCount: number };
export type RenewalRequest = { reason: "manual" | "navigation"; pathname?: string };

/** The home page, including its query string/locale, never counts as navigation activity. */
export function renewableNavigation(pathname: string | undefined) {
  return Boolean(pathname && /^\/(?:pl|en)\/[^?#]+$/.test(pathname) &&
    !pathname.includes("//") && !pathname.split("/").some(part => part === "." || part === ".."));
}

export function renewalDecision(row: SessionRecord, policy: AuthConfig, input: RenewalRequest, now = Date.now()) {
  const remaining = row.expiresAt.getTime() - now;
  if (remaining <= 0) return "expired";
  if (row.renewalCount >= policy.SESSION_MAX_REFRESHES) return "limit";
  if (input.reason === "navigation" && (!policy.SESSION_AUTO_REFRESH || !renewableNavigation(input.pathname))) return "disabled";
  if (input.reason === "manual" && remaining > policy.SESSION_WARNING * 1000) return "not-warning";
  // Coalesce concurrent/tab/navigation events without consuming another extension.
  if (remaining >= policy.SESSION_TTL * 1000 - 10000) return "unchanged";
  return "renew";
}
