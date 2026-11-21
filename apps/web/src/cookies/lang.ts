import { isAppLocale, type AppLocale } from "../schemas/i18n.ts";
import { preferenceCookie, persistPreferenceCookie, readBrowserCookie, readPreferenceCookie, PREFERENCE_COOKIE_NAMES } from "./preferences.ts";

export const LANGUAGE_COOKIE_KEY = PREFERENCE_COOKIE_NAMES.language;

export function languageCookie(locale: AppLocale, secure = true, name: string = LANGUAGE_COOKIE_KEY): string {
  if (!isAppLocale(locale)) throw new Error("Invalid language preference");
  return preferenceCookie(name, locale, secure);
}

export function readLanguageCookie(read = readBrowserCookie, name: string = LANGUAGE_COOKIE_KEY): AppLocale | undefined {
  const value = readPreferenceCookie(name, read);
  return isAppLocale(value) ? value : undefined;
}

export function persistLanguage(locale: AppLocale, name: string = LANGUAGE_COOKIE_KEY) {
  if (!isAppLocale(locale)) throw new Error("Invalid language preference");
  persistPreferenceCookie(name, locale);
}
