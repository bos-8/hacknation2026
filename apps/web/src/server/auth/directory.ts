import "server-only";
import { z } from "zod";
import { getAuthConfig, type AuthConfig } from "./config.ts";
import { APP_ROLES, type AppRole } from "../../schemas/session.ts";
import { adminUserSchema, adminUsersQuerySchema, type AdminUsersPage, type AdminUsersQuery } from "../../schemas/admin-users.ts";

const userSchema = z.object({
  id: z.uuid(), enabled: z.literal(true), email: z.email(),
  emailVerified: z.boolean().default(false), username: z.string().optional(),
  firstName: z.string().optional(), lastName: z.string().optional(),
  attributes: z.record(z.string(), z.array(z.string())).optional(),
});

export type IdentityProfile = {
  keycloakUuid: string; name: string; email: string; emailVerified: boolean; image: string | null;
  firstName?: string; lastName?: string;
};
export interface IdentityDirectory {
  userCounts?(): Promise<{ total: number; enabled: number }>;
  listUsers(query: AdminUsersQuery): Promise<AdminUsersPage>;
  rolesByUuid?(uuid: string): Promise<AppRole[]>;
  byUuid(uuid: string): Promise<IdentityProfile | null>;
  byEmail(email: string): Promise<IdentityProfile | null>;
}

/** Profile data is fetched on demand, never cached in PostgreSQL or a session cookie. */
export function keycloakDirectory(config: AuthConfig): IdentityDirectory {
  let token: { value: string; expiresAt: number } | undefined;
  let pending: Promise<string> | undefined;
  async function accessToken(): Promise<string> {
    if (token && token.expiresAt > Date.now()) return token.value;
    if (pending) return pending;
    pending = (async () => {
      const response = await fetch(`${config.AUTH_ISSUER}/protocol/openid-connect/token`, {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: config.AUTH_DIRECTORY_CLIENT_ID,
          client_secret: config.AUTH_DIRECTORY_CLIENT_SECRET }),
      });
      if (!response.ok) throw new Error("Identity directory authentication unavailable");
      const result = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).parse(await response.json());
      token = { value: result.access_token, expiresAt: Date.now() + Math.max(0, result.expires_in - 30) * 1000 };
      return token.value;
    })();
    try { return await pending; } finally { pending = undefined; }
  }
  async function request(path: string) {
    const response = await fetch(`${config.AUTH_DIRECTORY_URL}${path}`, {
      cache: "no-store", signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${await accessToken()}` },
    });
    if (response.status === 404) return null;
    if (!response.ok) { if (response.status === 401) token = undefined; throw new Error("Identity directory unavailable"); }
    return response.json() as Promise<unknown>;
  }
  function profile(raw: unknown): IdentityProfile | null {
    const result = userSchema.safeParse(raw);
    if (!result.success) return null;
    const user = result.data;
    const firstName = user.firstName?.trim() || undefined;
    const lastName = user.lastName?.trim() || undefined;
    const picture = user.attributes?.picture?.[0];
    let image: string | null = null;
    if (picture) {
      try {
        const url = new URL(picture);
        if (url.origin === config.AUTH_BASE_URL && !url.username && !url.password && !url.search && !url.hash &&
            /^\/api\/v1\/avatars\/[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/.test(url.pathname)) image = url.href;
      } catch { /* Untrusted picture values never enter the application UI. */ }
    }
    return { keycloakUuid: user.id, email: user.email, emailVerified: user.emailVerified, image,
      firstName, lastName,
      name: [firstName, lastName].filter(Boolean).join(" ") || user.username?.trim() || user.email };
  }
  return {
    async userCounts() {
      // Match the user table's search semantics, excluding Keycloak service accounts in both totals.
      const [total, enabled] = await Promise.all([request('/users/count?search=*'), request('/users/count?search=*&enabled=true')]);
      return { total: z.number().int().nonnegative().parse(total), enabled: z.number().int().nonnegative().parse(enabled) };
    },
    async listUsers(query) {
      const { page, search, limit, enabled, emailVerified } = adminUsersQuerySchema.parse(query);
      // Keycloak excludes service accounts on its search path, as it does for the unfiltered list.
      const filter: Record<string, string> = {};
      if (search || enabled !== undefined || emailVerified !== undefined) filter.search = search || "*";
      if (enabled !== undefined) filter.enabled = String(enabled);
      if (emailVerified !== undefined) filter.emailVerified = String(emailVerified);
      const params = new URLSearchParams({ ...filter, first: String((page - 1) * limit),
        max: String(limit), briefRepresentation: "true" });
      const [users, total] = await Promise.all([
        request(`/users?${params}`), request(`/users/count?${new URLSearchParams(filter)}`),
      ]);
      return { users: z.array(adminUserSchema).max(limit).parse(users), total: z.number().int().nonnegative().parse(total) };
    },
    async rolesByUuid(uuid) {
      if (!z.uuid().safeParse(uuid).success) return [];
      const raw = await request(`/users/${encodeURIComponent(uuid)}/role-mappings/realm/composite`);
      if (raw === null) return [];
      const roles = z.array(z.object({ name: z.string() })).parse(raw);
      return APP_ROLES.filter(role => roles.some(item => item.name === role));
    },
    async byUuid(uuid) {
      if (!z.uuid().safeParse(uuid).success) return null;
      const result = profile(await request(`/users/${encodeURIComponent(uuid)}`));
      return result?.keycloakUuid === uuid ? result : null;
    },
    async byEmail(email) {
      if (!z.email().safeParse(email).success) return null;
      const raw = await request(`/users?${new URLSearchParams({ email, exact: "true", max: "2" })}`);
      if (!Array.isArray(raw) || raw.length !== 1) return null;
      const result = profile(raw[0]);
      return result?.email.toLowerCase() === email.toLowerCase() ? result : null;
    },
  };
}

let directory: IdentityDirectory | undefined;
/** Reuse the service credential, never cache user profiles. */
export function getIdentityDirectory() { return directory ??= keycloakDirectory(getAuthConfig()); }
