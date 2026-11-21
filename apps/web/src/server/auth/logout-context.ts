import "server-only";
import { API_ROUTES } from "../../config/api-routes.ts";
import { createHash, randomBytes } from "node:crypto";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { deleteSessionCookie } from "better-auth/cookies";
import { decryptOAuthToken } from "better-auth/oauth2";
import { z } from "zod";
import type { PrismaClient } from "@formiq/database";
import type { AuthConfig } from "./config.ts";

type Context = Parameters<typeof deleteSessionCookie>[0];
const PREFIX = "logout-context:";
export const LOGOUT_GRACE_SECONDS = 300;
const schema = z.object({ sessionUuid: z.uuid(), userUuid: z.uuid(), sessionExpiresAt: z.iso.datetime(), idToken: z.string().min(1) });
const identifier = (value: string) => PREFIX + createHash("sha256").update(value).digest("hex");

/** A signed, opaque logout-only capability. It never authenticates or renews a session. */
export async function readLogoutContext(ctx: Context, database: PrismaClient) {
  const cookie = ctx.context.createAuthCookie("logout_context");
  const handle = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!handle || !/^[A-Za-z0-9_-]{43}$/.test(handle)) return null;
  const record = await database.verification.findFirst({ where: { identifier: identifier(handle), expiresAt: { gt: new Date() } } });
  if (!record) return null;
  try {
    const data = schema.parse(JSON.parse(await symmetricDecrypt({ key: ctx.context.secretConfig, data: record.value })));
    return { handle, record, data };
  } catch { return null; }
}

/** Capture at callback; backfill older active sessions and retain the original hint on renewal. */
export async function ensureLogoutContext(ctx: Context, database: PrismaClient, sessionUuid: string) {
  const row = await database.session.findUnique({ where: { uuid: sessionUuid } });
  if (!row || row.expiresAt.getTime() <= Date.now()) return;
  const existing = await readLogoutContext(ctx, database);
  const expiresAt = new Date(row.expiresAt.getTime() + LOGOUT_GRACE_SECONDS * 1000);
  const matching = existing?.data.sessionUuid === row.uuid && existing.data.userUuid === row.userUuid;
  if (matching && existing.data.sessionExpiresAt === row.expiresAt.toISOString()) return;

  let idToken = matching ? existing.data.idToken : undefined;
  if (!idToken) {
    const account = await database.account.findFirst({ where: { userUuid: row.userUuid, provider: "keycloak" }, select: { idToken: true } });
    if (!account?.idToken) return;
    idToken = await decryptOAuthToken(account.idToken, ctx.context);
  }
  const data = { sessionUuid: row.uuid, userUuid: row.userUuid, sessionExpiresAt: row.expiresAt.toISOString(), idToken };
  const value = await symmetricEncrypt({ key: ctx.context.secretConfig, data: JSON.stringify(data) });
  const handle = matching ? existing.handle : randomBytes(32).toString("base64url");
  if (matching) await database.verification.update({ where: { uuid: existing.record.uuid }, data: { value, expiresAt } });
  else {
    if (existing) await database.verification.deleteMany({ where: { uuid: existing.record.uuid } });
    await database.verification.deleteMany({ where: { identifier: { startsWith: PREFIX }, expiresAt: { lte: new Date() } } });
    await database.verification.create({ data: { identifier: identifier(handle), value, expiresAt } });
  }
  const cookie = ctx.context.createAuthCookie("logout_context");
  await ctx.setSignedCookie(cookie.name, handle, ctx.context.secret, {
    ...cookie.attributes, maxAge: Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
  });
}

/** Clear only this application's auth namespace, including old names/domain/path variants. */
export function clearAuthCookies(ctx: Context, config: AuthConfig) {
  deleteSessionCookie(ctx);
  const cookie = ctx.context.createAuthCookie("logout_context");
  const secure = new URL(config.AUTH_BASE_URL).protocol === "https:";
  const host = new URL(config.AUTH_BASE_URL).hostname;
  const names = new Set<string>([cookie.name]);
  for (const suffix of ["session_token", "session_data", "account_data", "dont_remember", "logout_context"]) {
    names.add(`${config.AUTH_COOKIE_PREFIX}.${suffix}`);
    if (secure) names.add(`__Secure-${config.AUTH_COOKIE_PREFIX}.${suffix}`);
  }
  const received = (ctx.headers?.get("cookie") ?? "").split(";").map(part => part.trim().split("=")[0]).filter(name => {
    const plain = name.replace(/^__(?:Secure|Host)-/, "");
    return plain.startsWith(`${config.AUTH_COOKIE_PREFIX}.`) && /^[A-Za-z0-9_.-]+$/.test(name);
  });
  for (const name of received) names.add(name);
  for (const name of names) {
    const paths = name.startsWith("__Host-") ? ["/"] : ["/", API_ROUTES.auth, "/api/auth"];
    for (const path of paths) {
      const attributes = { httpOnly: true, secure, sameSite: "lax" as const, path, maxAge: 0, expires: new Date(0) };
      ctx.setCookie(name, "", attributes);
      if (!name.startsWith("__Host-") && host !== "localhost") ctx.setCookie(name, "", { ...attributes, domain: host });
    }
  }
}
