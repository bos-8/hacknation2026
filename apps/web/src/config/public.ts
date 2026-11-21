import { z } from "zod";
import { parseConfig } from "./parse.ts";
import { COOKIE_CONSENT_NAME, PREFERENCE_COOKIE_NAMES } from "../cookies/core.js";
import { isPreferenceCookieDomain, isPreferenceCookieName } from "../schemas/preference-cookie.ts";

const cookieNameSchema = z.string().refine(value => isPreferenceCookieName(value) && value !== COOKIE_CONSENT_NAME, "Invalid or reserved preference cookie name");

/** Public settings only. Unknown fields, including secrets, are stripped. */
export const webConfigSchema = z.object({
  APP_NAME: z.string().trim().min(1).max(100).default("FORMIQ"),
  APP_COMPANY_NAME: z.string().trim().min(1).max(100).default("BOSIT"),
  LANGUAGE_COOKIE_NAME: cookieNameSchema.default(PREFERENCE_COOKIE_NAMES.language),
  THEME_COOKIE_NAME: cookieNameSchema.default(PREFERENCE_COOKIE_NAMES.theme),
  CONTRAST_COOKIE_NAME: cookieNameSchema.default(PREFERENCE_COOKIE_NAMES.contrast),
  UI_PREFERENCE_COOKIE_DOMAIN: z.string().refine(value => value === "" || isPreferenceCookieDomain(value)).default(""),
}).superRefine((value, context) => {
  const fields = ["LANGUAGE_COOKIE_NAME", "THEME_COOKIE_NAME", "CONTRAST_COOKIE_NAME"] as const;
  const used = new Set<string>();
  for (const field of fields) {
    if (used.has(value[field])) context.addIssue({ code: "custom", path: [field], message: "Cookie names must be distinct" });
    used.add(value[field]);
  }
});

export type WebConfig = z.infer<typeof webConfigSchema>;

export function getWebConfig(values: unknown = {}): WebConfig {
  return parseConfig(webConfigSchema, values, "web");
}
