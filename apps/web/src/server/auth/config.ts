import "server-only";
import { z } from "zod";
import { parseConfig } from "../../config/parse.ts";
import { sessionPolicySchema } from "../../schemas/session.ts";

const secureUrl = z.url().pipe(z.string().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
}));
const schema = z.object({
  AUTH_BASE_URL: secureUrl,
  AUTH_SECRET: z.string().min(32).refine(value => value.trim().length > 0),
  AUTH_ISSUER: secureUrl,
  AUTH_CLIENT_ID: z.string().min(1),
  AUTH_CLIENT_SECRET: z.string().min(1),
  AUTH_DIRECTORY_URL: secureUrl,
  AUTH_DIRECTORY_CLIENT_ID: z.string().min(1),
  AUTH_DIRECTORY_CLIENT_SECRET: z.string().min(1),
  AUTH_COOKIE_PREFIX: z.string().regex(/^[a-zA-Z0-9_]+$/).default("formiq_auth"),
  ...sessionPolicySchema.shape,
}).refine(value => value.SESSION_WARNING < value.SESSION_TTL, { path: ["SESSION_WARNING"], message: "Warning must precede expiry" });

export function getAuthConfig(values: unknown = process.env) {
  const config = parseConfig(schema, values, "auth");
  const base = new URL(config.AUTH_BASE_URL);
  const issuer = new URL(config.AUTH_ISSUER);
  const directory = new URL(config.AUTH_DIRECTORY_URL);
  if (base.pathname !== "/" || base.search || base.hash || base.username || base.password ||
      !/^\/realms\/[^/]+$/.test(issuer.pathname) || issuer.search || issuer.hash || issuer.username || issuer.password ||
      directory.pathname !== `/admin${issuer.pathname}` || directory.search || directory.hash || directory.username || directory.password) {
    throw new Error("Invalid auth origin or Keycloak realm URL");
  }
  return { ...config, AUTH_BASE_URL: base.origin };
}

export type AuthConfig = ReturnType<typeof getAuthConfig>;
