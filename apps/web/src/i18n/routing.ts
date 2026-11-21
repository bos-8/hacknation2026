import { defineRouting } from "next-intl/routing";
import { APP_LOCALES, DEFAULT_LOCALE } from "@/schemas/i18n";

export const routing = defineRouting({
  locales: APP_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  localeDetection: false,
  // The proxy owns cookie settings, while selectors receive the same name from the layout.
  localeCookie: false,
});
