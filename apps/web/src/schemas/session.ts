import { z } from "zod";

export const APP_ROLES = ["ROOT", "SADMIN", "ADMIN", "SYSTEM", "AUDITOR", "VIEWER", "USER", "GUEST", "LOGED"] as const;
export const sessionPolicySchema = z.object({
  SESSION_TTL: z.coerce.number().int().min(300).max(28800).default(2700),
  SESSION_WARNING: z.coerce.number().int().min(10).max(28799).default(120),
  SESSION_AUTO_REFRESH: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  SESSION_MAX_REFRESHES: z.coerce.number().int().min(0).max(1000).default(3),
});

export const sessionStatusSchema = z.object({
  sessionUuid: z.uuid(), userUuid: z.uuid(),
  expiresAt: z.iso.datetime(), serverTime: z.iso.datetime(),
  warningSeconds: z.number().int().positive(), ttlSeconds: z.number().int().positive(),
  autoRefresh: z.boolean(), refreshes: z.number().int().nonnegative(), maxRefreshes: z.number().int().nonnegative(),
  roles: z.array(z.enum(APP_ROLES)).nullable(),
});
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type AppRole = typeof APP_ROLES[number];
export const ADMIN_ROLES = ["ROOT", "SADMIN", "ADMIN"] as const satisfies readonly AppRole[];
