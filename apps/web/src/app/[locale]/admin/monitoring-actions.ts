"use server";

import { readHealth } from "@formiq/monitoring";
import { DEFAULT_HISTORY_HOURS, isHistoryHours } from "@formiq/monitoring/contracts";
import { getDatabase } from "@/server/database";
import { withAdminSession } from "@/server/auth/admin-action";

export async function refreshMonitoring(hours: unknown = DEFAULT_HISTORY_HOURS) {
  return withAdminSession(async () => {
    if (!isHistoryHours(hours)) return { status: "failed" as const };
    try { return { status: "ok" as const, overview: await readHealth(getDatabase(), new Date(), hours) }; }
    catch { return { status: "failed" as const }; }
  });
}
