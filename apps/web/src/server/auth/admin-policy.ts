import "server-only";
import type { AppRole } from "../../schemas/session.ts";
import { ADMIN_ACCESS, roleLevel } from "../../schemas/access.ts";

type AdminSession = { session: { expiresAt: Date }; user: { keycloakUuid: string } };
type Access = "allowed" | "unauthenticated" | "forbidden" | "unavailable";

/** Authentication always precedes role reads. Missing/unavailable roles grant nothing. */
export async function evaluateAdminAccess({ readSession, readRoles }: {
  readSession: () => Promise<AdminSession | null>;
  readRoles: (keycloakUuid: string) => Promise<readonly AppRole[] | null | undefined>;
}): Promise<Access> {
  try {
    const current = await readSession();
    if (!current || !(new Date(current.session.expiresAt).getTime() > Date.now())) return "unauthenticated";
    const roles = await readRoles(current.user.keycloakUuid);
    if (!roles) return "unavailable";
    return roleLevel(roles) >= ADMIN_ACCESS.minRoleLevel ? "allowed" : "forbidden";
  } catch { return "unavailable"; }
}
