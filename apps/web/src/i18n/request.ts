import "server-only";
import { locale as getRootLocale } from "next/root-params";
import { getRequestConfig } from "next-intl/server";
import { getServerConfig } from "@/config/server";
import { isAppLocale, DEFAULT_LOCALE } from "@/schemas/i18n";
import { messages } from "./catalogs";

export default getRequestConfig(async ({ locale: override }) => {
  const requested = override ?? await getRootLocale();
  const locale = isAppLocale(requested) ? requested : DEFAULT_LOCALE;
  return { locale, messages: messages[locale], timeZone: getServerConfig().TZ };
});
