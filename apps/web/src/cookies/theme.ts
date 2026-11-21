import { isAppTheme, type AppTheme } from "../schemas/theme.ts";
import { persistPreferenceCookie, readBrowserCookie, readPreferenceCookie, PREFERENCE_COOKIE_NAMES } from "./preferences.ts";

export const THEME_COOKIE_KEY = PREFERENCE_COOKIE_NAMES.theme;

export function readThemeCookie(read = readBrowserCookie, name: string = THEME_COOKIE_KEY): AppTheme {
  const value = readPreferenceCookie(name, read);
  return isAppTheme(value) ? value : "system";
}

export function persistTheme(theme: AppTheme, domain = "", name: string = THEME_COOKIE_KEY) {
  if (!isAppTheme(theme)) throw new Error("Invalid theme preference");
  persistPreferenceCookie(name, theme, domain);
}

export function applyTheme(theme: AppTheme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
