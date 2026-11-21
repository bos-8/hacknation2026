import { getLocale } from "next-intl/server";
import { DEFAULT_LOCALE, isAppLocale } from "@/schemas/i18n";
import { AccessStatus } from "@/ui/layout/access-status";

export default async function Forbidden() {
  const locale = await getLocale();
  return <AccessStatus locale={isAppLocale(locale) ? locale : DEFAULT_LOCALE} status={403} />;
}
