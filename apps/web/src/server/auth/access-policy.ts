import "server-only";
import { accessPolicySchema, roleLevel, type AccessPolicy } from "../../schemas/access.ts";

type Session = { session: { expiresAt: Date }; user: { id: string; keycloakUuid: string } };
export type AccessContext = { actorUuid: string | null; roleLevel: number | null; roles: readonly string[] };
export type AccessDecision = { status: "allowed"; context: AccessContext } | { status: "unauthenticated" | "forbidden" | "unavailable" };

export async function evaluateAccess(policy: AccessPolicy, {
  readSession, readRoles,
}: { readSession: () => Promise<Session | null>; readRoles: (keycloakUuid: string) => Promise<readonly string[] | null | undefined> }): Promise<AccessDecision> {
  const parsed = accessPolicySchema.safeParse(policy);
  if (!parsed.success) return { status: "forbidden" };
  const required = parsed.data;
  try {
    const session = await readSession();
    const valid = session && new Date(session.session.expiresAt).getTime() > Date.now();
    if (!valid) return required.requireLogin || required.minRoleLevel !== undefined
      ? { status: "unauthenticated" } : { status: "allowed", context: { actorUuid: null, roleLevel: null, roles: [] } };
    let roles: readonly string[] | null | undefined;
    try { roles = await readRoles(session.user.keycloakUuid); } catch { roles = null; }
    // Directory failure cannot raise privileges; a verified login still meets level zero.
    if (!roles) return (required.minRoleLevel ?? 0) > 0 ? { status: "unavailable" }
      : { status: "allowed", context: { actorUuid: session.user.id, roleLevel: 0, roles: [] } };
    const level = roleLevel(roles);
    return level >= (required.minRoleLevel ?? 0)
      ? { status: "allowed", context: { actorUuid: session.user.id, roleLevel: level, roles } }
      : { status: "forbidden" };
  } catch { return { status: "unavailable" }; }
}
