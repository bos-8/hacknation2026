import "server-only";
import { AUTH_ENDPOINTS } from "../../config/api-routes.ts";
import { APIError, createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { decryptOAuthToken } from "better-auth/oauth2";
import { z } from "zod";
import type { PrismaClient } from "@formiq/database";
import type { AuthConfig } from "./config.ts";
import { clearAuthCookies, ensureLogoutContext, readLogoutContext } from "./logout-context.ts";

/** Cookie-authenticated logout also works for expired/disabled sessions; never trust a client UUID alone. */
export function hardLogoutPlugin(config: AuthConfig, database: PrismaClient, ownerEnabled: (userUuid: string) => Promise<boolean>) {
  return { id: "formiq-hard-logout",
    hooks: { after: [{
      matcher: (ctx: { path?: string }) => Boolean(ctx.path?.startsWith("/callback/")) ||
        ctx.path === AUTH_ENDPOINTS.status || ctx.path === AUTH_ENDPOINTS.renew,
      handler: createAuthMiddleware(async ctx => {
        const current = ctx.context.newSession ?? ctx.context.session;
        if (current) await ensureLogoutContext(ctx, database, current.session.id);
      }),
    }] }, endpoints: {
    logoutStatus: createAuthEndpoint(AUTH_ENDPOINTS.logoutContext, { method: "GET", requireHeaders: true }, async ctx => {
      const saved = await readLogoutContext(ctx, database);
      if (!saved) return ctx.json(null);
      const lease = await database.session.findUnique({ where: { uuid: saved.data.sessionUuid } });
      if (lease && lease.userUuid !== saved.data.userUuid) return ctx.json(null);
      if (lease && lease.expiresAt.getTime() > Date.now()) {
        // A lost main cookie does not turn a still-valid lease into pending logout.
        // Show sign-in without authenticating through the logout-only context.
        try { if (await ownerEnabled(lease.userUuid)) return ctx.json(null); }
        catch { throw new APIError("SERVICE_UNAVAILABLE"); }
      }
      return ctx.json({ sessionUuid: saved.data.sessionUuid, userUuid: saved.data.userUuid,
        expiresAt: saved.data.sessionExpiresAt });
    }),
    hardSignOut: createAuthEndpoint(AUTH_ENDPOINTS.logout, { method: "POST", requireHeaders: true,
      body: z.object({ locale: z.enum(["pl", "en"]).default("pl"), sessionUuid: z.uuid().optional(),
        expectedExpiresAt: z.iso.datetime().optional(), expectedRenewalCount: z.number().int().min(0).max(1000).optional(),
        reason: z.enum(["manual", "expired", "invalid"]).default("manual") }) }, async ctx => {
      if (ctx.headers.get("origin") !== config.AUTH_BASE_URL) throw new APIError("FORBIDDEN");
      const home = `${config.AUTH_BASE_URL}/${ctx.body.locale}`;
      const token = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
      const row = token ? await database.session.findUnique({ where: { token } }) : null;
      const saved = await readLogoutContext(ctx, database);
      const ownerUuid = row?.uuid ?? saved?.data.sessionUuid;
      if (ownerUuid && ctx.body.sessionUuid && ownerUuid !== ctx.body.sessionUuid) {
        return ctx.json({ success: true, changed: true, url: home });
      }
      const ownedRow = row ?? (saved ? await database.session.findUnique({ where: { uuid: saved.data.sessionUuid } }) : null);
      const automatic = ctx.body.reason !== "manual";
      let disabledOwner = false;
      const leaseCanContinue = async (userUuid: string) => {
        if (ctx.body.reason !== "invalid") return true;
        try { disabledOwner = !await ownerEnabled(userUuid); return !disabledOwner; }
        catch { throw new APIError("SERVICE_UNAVAILABLE"); }
      };
      const newerLease = ownedRow && (
        ctx.body.expectedRenewalCount !== undefined && ownedRow.renewalCount > ctx.body.expectedRenewalCount ||
        ctx.body.expectedExpiresAt !== undefined && ownedRow.expiresAt.getTime() > Date.parse(ctx.body.expectedExpiresAt)
      );
      // An older tab must not terminate a lease another tab has just extended.
      if (ownedRow && automatic && (ctx.body.reason === "expired" || newerLease) && ownedRow.expiresAt.getTime() > Date.now()
        && await leaseCanContinue(ownedRow.userUuid)) {
        return ctx.json({ success: true, renewed: true });
      }
      let idToken = saved && (!row || saved.data.sessionUuid === row.uuid) ? saved.data.idToken : undefined;
      if (row && !idToken) {
        const account = await database.account.findFirst({ where: { userUuid: row.userUuid, provider: "keycloak" }, select: { idToken: true } });
        if (account?.idToken) {
          try { idToken = await decryptOAuthToken(account.idToken, ctx.context); } catch { /* Local revocation must still complete. */ }
        }
      }
      if (ownedRow) {
        const removed = await database.session.deleteMany({ where: {
          uuid: ownedRow.uuid, userUuid: ownedRow.userUuid,
          ...(automatic && !disabledOwner ? { expiresAt: ownedRow.expiresAt, renewalCount: ownedRow.renewalCount } : {}),
        } });
        if (automatic && removed.count === 0) {
          const latest = await database.session.findUnique({ where: { uuid: ownedRow.uuid } });
          if (latest && latest.expiresAt.getTime() > Date.now()) {
            if (await leaseCanContinue(latest.userUuid)) return ctx.json({ success: true, renewed: true });
            // Verified disabled identities must not survive through a renewal loop.
            await database.session.deleteMany({ where: { uuid: latest.uuid, userUuid: latest.userUuid } });
          }
        }
      }
      if (saved) {
        const consumed = await database.verification.deleteMany({ where: { uuid: saved.record.uuid, value: saved.record.value } });
        if (!row && !consumed.count) idToken = undefined;
      }
      clearAuthCookies(ctx, config);
      ctx.setHeader("Cache-Control", "no-store");
      ctx.setHeader("Referrer-Policy", "no-referrer");
      if (idToken) {
        const url = new URL(`${config.AUTH_ISSUER}/protocol/openid-connect/logout`);
        url.searchParams.set("id_token_hint", idToken);
        url.searchParams.set("client_id", config.AUTH_CLIENT_ID);
        url.searchParams.set("post_logout_redirect_uri", home);
        return ctx.json({ success: true, url: url.href });
      }
      return ctx.json({ success: true, url: home });
    }),
  } };
}
