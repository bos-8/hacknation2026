import "server-only";
import { z } from "zod";
import { parseConfig } from "./parse.ts";
import { getWebConfig } from "./public.ts";

const runtimeSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TZ: z.string().refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }).default("Europe/Warsaw"),
});

/** Validate at runtime, without embedding process.env in browser modules. */
export function getServerConfig(values: unknown = process.env) {
  return { ...parseConfig(runtimeSchema, values, "server"), ...getWebConfig(values) };
}

/** Explicit public allowlist, safe to pass as props to Client Components. */
export function getPublicConfig(values: unknown = process.env) {
  return getWebConfig(values);
}
