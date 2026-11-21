import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { AccessStatus } from "@/ui/layout/access-status";

export default async function AccessDeniedPage({ params }: PageProps<"/[locale]/access-denied">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  return <AccessStatus locale={locale} status={403} />;
}
