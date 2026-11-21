"use server";

import { withAdminSession } from "@/server/auth/admin-action";
import { getJobQueue } from "@/server/queue";
import { queueDiagnosticSchema, queueQuerySchema, type QueueQuery } from "@/schemas/queue";
import { jobActionSchema } from '@/schemas/queue';
import { activeSystemConfig } from '@formiq/database';
import { getDatabase } from '@/server/database';

export async function refreshQueue(input: QueueQuery) {
  return withAdminSession(async () => {
    const parsed = queueQuerySchema.safeParse(input);
    if (!parsed.success) return { status: "failed" as const };
    try { return { status: "ok" as const, page: await getJobQueue().list(parsed.data) }; }
    catch { return { status: "failed" as const }; }
  });
}
export async function changeQueueJob(input: unknown) {
  return withAdminSession(async actor => {
    const parsed = jobActionSchema.safeParse(input);
    if (!parsed.success) return { status: 'invalid' as const };
    try {
      const requiresConfig = parsed.data.name !== 'system.check' && ['repeat','retry','resume'].includes(parsed.data.operation);
      const active = requiresConfig ? await activeSystemConfig(getDatabase()) : null;
      return await getJobQueue().changeJob(parsed.data, actor, active?.uuid ?? null);
    } catch { return { status: 'failed' as const }; }
  });
}
export async function testQueue(input: unknown) {
  return withAdminSession(async actor => {
    const parsed = queueDiagnosticSchema.safeParse(input);
    if (!parsed.success) return { status: "invalid" as const };
    try {
      const id = await getJobQueue().enqueueDiagnostic(parsed.data.failures, actor, parsed.data.executor);
      return { status: "ok" as const, id };
    } catch { return { status: "failed" as const }; }
  });
}
