import "server-only";
import { API_ROUTES } from "../../config/api-routes.ts";
import { betterAuth } from "better-auth/minimal";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { nextCookies } from "better-auth/next-js";
import { z } from "zod";
import { getDatabase } from "../database.ts";
import { getAuthConfig } from "./config.ts";
import { getIdentityDirectory, keycloakDirectory, type IdentityDirectory } from "./directory.ts";
import { identityAdapter } from "./adapter.ts";
import { sessionLifecyclePlugin } from "./session-plugin.ts";
import { hardLogoutPlugin } from "./logout-plugin.ts";
import type { AuthConfig } from "./config.ts";
import type { PrismaClient } from "@formiq/database";

const profileSchema = z.object({ sub: z.uuid(), email: z.email(), email_verified: z.boolean().default(false),
  name: z.string().optional(), preferred_username: z.string().optional() });

/** Dependencies are explicit so the complete OIDC flow can be tested on disposable services. */
export function createAuth(config: AuthConfig, database: PrismaClient, directory: IdentityDirectory = keycloakDirectory(config)) {
  return betterAuth({
    appName: "FORMIQ", baseURL: config.AUTH_BASE_URL, basePath: API_ROUTES.auth, secret: config.AUTH_SECRET,
    trustedOrigins: [config.AUTH_BASE_URL], database: identityAdapter(database, directory),
    onAPIError: { errorURL: `${config.AUTH_BASE_URL}/pl?auth=unavailable` },
    emailAndPassword: { enabled: false },
    disabledPaths: ["/update-user", "/delete-user", "/change-email", "/link-social", "/unlink-account", "/sign-up/email", "/sign-in/email"],
    // Input comes from the verified provider mapping; local profile/sign-up endpoints are disabled.
    user: {
      additionalFields: { keycloakUuid: { type: "string", required: true, validator: { input: z.uuid() } } },
      validateUserInfo({ source, user }) {
        const profile = profileSchema.safeParse(source.oauth?.profile);
        if (source.method !== "oauth" || source.oauth?.providerId !== "keycloak" || source.action === "link-account" ||
            !profile.success || user.keycloakUuid !== profile.data.sub) return { error: "identity_not_allowed" };
      },
    },
    account: { encryptOAuthTokens: true, accountLinking: { enabled: false }, storeStateStrategy: "database" },
    session: { expiresIn: config.SESSION_TTL, disableSessionRefresh: true, storeSessionInDatabase: true,
      additionalFields: { renewalCount: { type: "number", defaultValue: 0, input: false } },
      cookieCache: { enabled: false } },
    advanced: { database: { generateId: false, joins: false }, cookiePrefix: config.AUTH_COOKIE_PREFIX,
      useSecureCookies: config.AUTH_BASE_URL.startsWith("https:"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" } },
    rateLimit: { enabled: true, storage: "memory", window: 60, max: 60,
      customRules: { "/sign-in/social": { window: 60, max: 10 } } },
    logger: { disabled: true }, telemetry: { enabled: false },
    plugins: [genericOAuth({ config: [{
      providerId: "keycloak", clientId: config.AUTH_CLIENT_ID, clientSecret: config.AUTH_CLIENT_SECRET,
      discoveryUrl: `${config.AUTH_ISSUER}/.well-known/openid-configuration`,
      scopes: ["openid", "profile", "email"], pkce: true, requireIdTokenVerification: true,
      // Our logout endpoint decrypts the provider hint and checks the expected session UUID.
      disableProviderLogout: true,
      mapProfileToUser(raw) {
        const profile = profileSchema.parse(raw);
        return { keycloakUuid: profile.sub, name: profile.name ?? profile.preferred_username ?? profile.email,
          email: profile.email, emailVerified: profile.email_verified };
      },
    }] }), sessionLifecyclePlugin(config, database, directory), hardLogoutPlugin(config, database, async userUuid => {
      const owner = await database.user.findUnique({ where: { uuid: userUuid }, select: { keycloakUuid: true } });
      return Boolean(owner?.keycloakUuid && await directory.byUuid(owner.keycloakUuid));
    }), nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return instance ??= createAuth(getAuthConfig(), getDatabase(), getIdentityDirectory()); }
