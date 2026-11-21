import { z } from "zod";
import { JOB_STATES, QUEUE_ACTIONS } from "@formiq/queue/contracts";
export type { JobRow, QueuePage } from "@formiq/queue/contracts";

export const QUEUE_PAGE_SIZES = [1, 10, 25, 50] as const;
export const jobStateSchema = z.enum(JOB_STATES);
export const queueQuerySchema = z.object({
  page: z.number().int().min(1).max(40001).default(1), limit: z.literal(QUEUE_PAGE_SIZES).default(25),
  search: z.string().trim().max(200).default(""), state: jobStateSchema.optional(),
});
export type QueueQuery = z.infer<typeof queueQuerySchema>;
export const queueDiagnosticSchema = z.object({ failures: z.number().int().min(0).max(4), executor: z.enum(['node','python']).default('node') });
export const jobActionSchema = z.object({ id: z.uuid(), name: z.enum(['system.check','monitoring.collect','monitoring.cleanup']), operation: z.enum(QUEUE_ACTIONS), expectedState: jobStateSchema,
  expectedRetryCount: z.number().int().min(0), expectedAdminActionUuid: z.uuid().nullable() });
export function parseQueueQuery(params: Record<string, string | string[] | undefined>): QueueQuery {
  const page = typeof params.page === "string" && /^[1-9]\d{0,4}$/.test(params.page) ? Number(params.page) : 1;
  return { page: queueQuerySchema.shape.page.safeParse(page).data ?? 1,
    limit: typeof params.limit === "string" ? QUEUE_PAGE_SIZES.find(value => String(value) === params.limit) ?? 25 : 25,
    search: queueQuerySchema.shape.search.safeParse(params.search).data ?? "", state: jobStateSchema.safeParse(params.state).data };
}
export function queueUrlParams(query: QueueQuery): Record<string, string> {
  return { page: String(query.page), limit: String(query.limit), ...(query.search ? { search: query.search } : {}), ...(query.state ? { state: query.state } : {}) };
}
