import { z } from "zod";

export const ROLE_LEVELS = { ROOT: 100, SADMIN: 90, ADMIN: 80, USER: 50, LOGED: 0 } as const;
export const accessPolicySchema = z.object({
  requireLogin: z.boolean().default(true),
  minRoleLevel: z.number().int().min(0).max(100).optional(),
});
export type AccessPolicy = z.input<typeof accessPolicySchema>;
export const ADMIN_ACCESS = { requireLogin: true, minRoleLevel: ROLE_LEVELS.ADMIN } as const;
export const LOGGED_ACCESS = { requireLogin: true, minRoleLevel: ROLE_LEVELS.LOGED } as const;

/** Only application-owned role names can raise the level; login alone has level zero. */
export function roleLevel(roles: readonly string[]): number {
  return roles.reduce((level, role) => Math.max(level, Object.hasOwn(ROLE_LEVELS, role) ? ROLE_LEVELS[role as keyof typeof ROLE_LEVELS] : 0), 0);
}
