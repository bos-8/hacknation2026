import "server-only";
import { AUTH_ENDPOINTS } from "../../config/api-routes.ts";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import type { PrismaClient } from "@formiq/database";
import type { AuthConfig } from "./config.ts";
import type { IdentityDirectory } from "./directory.ts";
import { renewalDecision } from "./session-policy.ts";
import type { SessionStatus, AppRole } from "../../schemas/session.ts";

export function sessionLifecyclePlugin(config: AuthConfig, database: PrismaClient, directory: IdentityDirectory) {
  async function roles(uuid: string): Promise<AppRole[] | null> {
    try { return directory.rolesByUuid ? await directory.rolesByUuid(uuid) : []; }
    catch { return null; } // Unavailable roles never become an implicit permission.
  }
  function view(row: { uuid: string; userUuid: string; expiresAt: Date; renewalCount: number }, assigned: AppRole[] | null): SessionStatus {
    return { sessionUuid: row.uuid, userUuid: row.userUuid, expiresAt: row.expiresAt.toISOString(), serverTime: new Date().toISOString(),
      warningSeconds: config.SESSION_WARNING, ttlSeconds: config.SESSION_TTL,
      autoRefresh: config.SESSION_AUTO_REFRESH, refreshes: row.renewalCount,
      maxRefreshes: config.SESSION_MAX_REFRESHES, roles: assigned };
  }
  return {
    id: "formiq-session-lifecycle",
    endpoints: {
      sessionStatus: createAuthEndpoint(AUTH_ENDPOINTS.status, { method: "GET", use: [sessionMiddleware] }, async ctx => {
        const current = ctx.context.session;
        const row = await database.session.findUnique({ where: { uuid: current.session.id } });
        if (!row || row.expiresAt.getTime() <= Date.now()) throw new APIError("UNAUTHORIZED");
        const user = current.user as typeof current.user & { keycloakUuid: string };
        return ctx.json(view(row, await roles(user.keycloakUuid)));
      }),
      renewSession: createAuthEndpoint(AUTH_ENDPOINTS.renew, { method: "POST", use: [sessionMiddleware],
        body: z.object({ reason: z.enum(["manual", "navigation"]), pathname: z.string().max(2048).optional() }) }, async ctx => {
        if (ctx.headers?.get("origin") !== config.AUTH_BASE_URL) throw new APIError("FORBIDDEN");
        const current = ctx.context.session;
        const row = await database.session.findUnique({ where: { uuid: current.session.id } });
        if (!row) throw new APIError("UNAUTHORIZED");
        const decision = renewalDecision(row, config, ctx.body);
        if (decision === "expired") throw new APIError("UNAUTHORIZED");
        if (decision !== "renew" && decision !== "unchanged") throw new APIError("FORBIDDEN", { message: decision });
        if (decision === "renew") {
          const expiresAt = new Date(Date.now() + config.SESSION_TTL * 1000);
          const updated = await database.session.updateMany({
            where: { uuid: row.uuid, userUuid: current.user.id, expiresAt: { equals: row.expiresAt, gt: new Date() },
              renewalCount: { equals: row.renewalCount, lt: config.SESSION_MAX_REFRESHES } },
            data: { expiresAt, renewalCount: { increment: 1 } },
          });
          if (updated.count === 1) {
            await setSessionCookie(ctx, { user: current.user, session: { ...current.session,
              expiresAt, updatedAt: new Date(), renewalCount: row.renewalCount + 1 } });
          }
        }
        const latest = await database.session.findUnique({ where: { uuid: row.uuid } });
        if (!latest || latest.expiresAt.getTime() <= Date.now()) throw new APIError("UNAUTHORIZED");
        const user = current.user as typeof current.user & { keycloakUuid: string };
        return ctx.json(view(latest, await roles(user.keycloakUuid)));
      }),
    },
  };
}
