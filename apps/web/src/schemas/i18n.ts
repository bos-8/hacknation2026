export const APP_LOCALES = ["pl", "en"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "pl";

export const LOCALE_META = [
  { code: "pl", label: "Polski", flag: "🇵🇱", switchLabel: "Zmień język na polski" },
  { code: "en", label: "English", flag: "🇬🇧", switchLabel: "Switch to English" },
] as const satisfies readonly { code: AppLocale; label: string; flag: string; switchLabel: string }[];

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (APP_LOCALES as readonly string[]).includes(value);
}

export function getNextLocale(locale: AppLocale): AppLocale {
  if (!isAppLocale(locale)) throw new Error("Invalid language preference");
  return APP_LOCALES[(APP_LOCALES.indexOf(locale) + 1) % APP_LOCALES.length];
}
