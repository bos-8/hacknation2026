import { z } from "zod";

export const ADMIN_USERS_PAGE_SIZE = 25;
const adminUsersPageSizeSchema = z.literal([1, 10, 25, 50]);
export const ADMIN_USERS_PAGE_SIZES = [...adminUsersPageSizeSchema.values];
export const ADMIN_USERS_MAX_PAGE = 40001;
export const adminUsersSortColumnSchema = z.enum(["username", "name", "email", "enabled", "emailVerified"]);
export type AdminUsersSortColumn = z.infer<typeof adminUsersSortColumnSchema>;
export const adminUsersQuerySchema = z.object({
  page: z.number().int().min(1).max(ADMIN_USERS_MAX_PAGE),
  search: z.string().trim().max(200),
  limit: adminUsersPageSizeSchema.default(ADMIN_USERS_PAGE_SIZE),
  enabled: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  sort: adminUsersSortColumnSchema.optional(),
  direction: z.enum(["asc", "desc"]).optional(),
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export function parseAdminUsersQuery(params: Record<string, string | string[] | undefined>): AdminUsersQuery {
  const page = typeof params.page === "string" && /^[1-9]\d{0,4}$/.test(params.page) ? Number(params.page) : 1;
  const search = typeof params.search === "string" ? params.search.trim() : "";
  const enabled = params.enabled === "true" || params.enabled === "false" ? params.enabled === "true" : undefined;
  const emailVerified = params.emailVerified === "true" || params.emailVerified === "false" ? params.emailVerified === "true" : undefined;
  const sort = adminUsersSortColumnSchema.safeParse(params.sort).data;
  return {
    page: adminUsersQuerySchema.shape.page.safeParse(page).data ?? 1,
    search: adminUsersQuerySchema.shape.search.safeParse(search).data ?? "",
    limit: typeof params.limit === "string"
      ? ADMIN_USERS_PAGE_SIZES.find(value => String(value) === params.limit) ?? ADMIN_USERS_PAGE_SIZE
      : ADMIN_USERS_PAGE_SIZE,
    ...(enabled === undefined ? {} : { enabled }),
    ...(emailVerified === undefined ? {} : { emailVerified }),
    ...(sort ? { sort, direction: params.direction === "desc" ? "desc" : "asc" } : {}),
  };
}

export function adminUsersUrlParams(query: AdminUsersQuery): Record<string, string> {
  const params: Record<string, string> = { page: String(query.page) };
  if (query.limit !== ADMIN_USERS_PAGE_SIZE) params.limit = String(query.limit);
  if (query.search) params.search = query.search;
  if (query.enabled !== undefined) params.enabled = String(query.enabled);
  if (query.emailVerified !== undefined) params.emailVerified = String(query.emailVerified);
  if (query.sort) {
    params.sort = query.sort;
    params.direction = query.direction ?? "asc";
  }
  return params;
}

// Listing includes disabled accounts and service accounts without email addresses.
export const adminUserSchema = z.object({
  id: z.uuid(), username: z.string().min(1), enabled: z.boolean(),
  email: z.string().optional(), emailVerified: z.boolean().default(false),
  firstName: z.string().optional(), lastName: z.string().optional(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUsersPage = { users: AdminUser[]; total: number };
