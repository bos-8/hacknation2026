import { isAppContrast, type AppContrast } from "../schemas/contrast.ts";
import { preferenceCookie, persistPreferenceCookie, readBrowserCookie, readPreferenceCookie, PREFERENCE_COOKIE_NAMES } from "./preferences.ts";

export const CONTRAST_COOKIE_KEY = PREFERENCE_COOKIE_NAMES.contrast;

export function contrastCookie(contrast: AppContrast, secure = true, domain?: string, name: string = CONTRAST_COOKIE_KEY): string {
  if (!isAppContrast(contrast)) throw new Error("Invalid contrast preference");
  return preferenceCookie(name, contrast, secure, domain);
}

export function readContrastCookie(read = readBrowserCookie, name: string = CONTRAST_COOKIE_KEY): AppContrast {
  const value = readPreferenceCookie(name, read);
  return isAppContrast(value) ? value : "normal";
}

export function persistContrast(contrast: AppContrast, domain = "", name: string = CONTRAST_COOKIE_KEY) {
  if (!isAppContrast(contrast)) throw new Error("Invalid contrast preference");
  persistPreferenceCookie(name, contrast, domain);
}

export function applyContrast(contrast: AppContrast) {
  if (!isAppContrast(contrast)) throw new Error("Invalid contrast preference");
  document.documentElement.dataset.contrast = contrast;
}
