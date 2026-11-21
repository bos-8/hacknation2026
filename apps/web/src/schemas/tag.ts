import { z } from "zod";

export const DEFAULT_TAG_COLOR = "#64748B";
export const tagStatusSchema = z.enum(["active", "inactive", "pending_archiving", "archived", "pending_deletion", "softdelete"]);
export const tagStatusTargetSchema = z.enum(["active", "inactive", "pending_archiving", "pending_deletion"]);
export type TagStatus = z.infer<typeof tagStatusSchema>;
export const tagStatusChangeSchema = z.object({ uuid: z.uuid(), expectedUpdatedAt: z.iso.datetime(), expectedStatus: tagStatusSchema, status: tagStatusTargetSchema })
  .refine(input => input.expectedStatus !== input.status);
export type TagStatusChange = z.infer<typeof tagStatusChangeSchema>;
export const tagColorSchema = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).transform(value => value.toUpperCase());
export const tagInputSchema = z.object({ name: z.string().trim().min(1).max(100), color: tagColorSchema });
export const tagSaveSchema = tagInputSchema.extend({ uuid: z.uuid().optional(), expectedUpdatedAt: z.iso.datetime().optional() })
  .refine(value => Boolean(value.uuid) === Boolean(value.expectedUpdatedAt));
export const tagDeleteSchema = z.object({ uuid: z.uuid(), expectedUpdatedAt: z.iso.datetime() });
export const TAG_PAGE_SIZES = [1, 10, 25, 50] as const;
export const tagQuerySchema = z.object({
  page: z.number().int().min(1).max(40001).default(1), limit: z.literal(TAG_PAGE_SIZES).default(25),
  search: z.string().trim().max(200).default(""), used: z.enum(["yes", "no"]).optional(), status: tagStatusSchema.optional(),
  sort: z.enum(["name", "color", "status", "updatedAt"]).default("name"), direction: z.enum(["asc", "desc"]).default("asc"),
});
export type TagQuery = z.infer<typeof tagQuerySchema>;
export type TagInput = z.infer<typeof tagSaveSchema>;
export type TagRow = { uuid: string; name: string; color: string; status: TagStatus; createdAt: Date; updatedAt: Date; createdByUuid: string; updatedByUuid: string; fileCount: number };
export type TagPage = { tags: TagRow[]; total: number };
export type TagResult = { status: "ok" | "invalid" | "denied" | "duplicate" | "conflict" | "inUse" | "failed" };

export function parseTagQuery(params: Record<string, string | string[] | undefined>): TagQuery {
  const page = typeof params.page === "string" && /^[1-9]\d{0,4}$/.test(params.page) ? Number(params.page) : 1;
  return {
    page: tagQuerySchema.shape.page.safeParse(page).data ?? 1,
    limit: typeof params.limit === "string" ? TAG_PAGE_SIZES.find(value => String(value) === params.limit) ?? 25 : 25,
    search: tagQuerySchema.shape.search.safeParse(params.search).data ?? "",
    used: tagQuerySchema.shape.used.safeParse(params.used).data,
    status: tagStatusSchema.safeParse(params.status).data,
    sort: tagQuerySchema.shape.sort.safeParse(params.sort).data ?? "name", direction: params.direction === "desc" ? "desc" : "asc",
  };
}
export function tagUrlParams(query: TagQuery): Record<string, string> {
  return { page: String(query.page), limit: String(query.limit), sort: query.sort, direction: query.direction,
    ...(query.search ? { search: query.search } : {}), ...(query.used ? { used: query.used } : {}), ...(query.status ? { status: query.status } : {}) };
}

/** Choose the better contrasting text color for a validated solid tag color. */
export function tagTextColor(color: string) {
  const hex = tagColorSchema.parse(color).slice(1);
  const channels = [0, 2, 4].map(offset => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.179 ? "#000000" : "#FFFFFF";
}
