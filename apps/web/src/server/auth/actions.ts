"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getAuth } from "./auth.ts";
import { getAuthConfig } from "./config.ts";
import { isAppLocale } from "@/schemas/i18n";
import type { AuthActionState } from "@/schemas/auth";
import { getPublicConfig } from "@/config/server";
import { isAppTheme } from "@/schemas/theme";

export async function signIn(_previous: AuthActionState, form: FormData): Promise<AuthActionState> {
  const selected = form.get("locale");
  const locale = isAppLocale(selected) ? selected : "pl";
  let destination: string | undefined;
  try {
    const config = getAuthConfig();
    const preference = (await cookies()).get(getPublicConfig().THEME_COOKIE_NAME)?.value;
    const result = await getAuth().api.signInSocial({ headers: await headers(), body: {
      provider: "keycloak", callbackURL: `${config.AUTH_BASE_URL}/${locale}`,
      additionalParams: { ui_locales: locale, formiq_theme: isAppTheme(preference) ? preference : "system" },
      errorCallbackURL: `${config.AUTH_BASE_URL}/${locale}?auth=unavailable`,
    } });
    if (result.url && new URL(result.url).origin === new URL(config.AUTH_ISSUER).origin) destination = result.url;
  } catch { /* Do not expose provider responses, tokens or private configuration. */ }
  if (!destination) return { unavailable: true };
  redirect(destination as Route);
}

export async function signOut(_previous: AuthActionState, form: FormData): Promise<AuthActionState> {
  const selected = form.get("locale");
  const locale = isAppLocale(selected) ? selected : "pl";
  let destination = `/${locale}`;
  try {
    const result = await getAuth().api.hardSignOut({ headers: await headers(), body: { locale, reason: "manual" } });
    if ("url" in result && result.url) destination = result.url;
  }
  catch { return { unavailable: true }; }
  redirect(destination as Route);
}
