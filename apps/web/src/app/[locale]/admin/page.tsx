// Access is resolved at request time; the shared authenticated shell can block navigation.
export const instant = false;

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { Heading, Text } from "@/ui/basic";
import { AdminDashboard } from "./admin-dashboard";

async function AdminContent({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  await requireAdminAccess();
  const t = await getTranslations({ locale, namespace: "common.admin.dashboard" });
  return <article className="min-w-0">
    <Heading level={2} className="text-xl">{t("title")}</Heading>
    <Text className="mt-2 text-muted-foreground">{t("description")}</Text>
    <AdminDashboard locale={locale} />
  </article>;
}

export default function AdminPage(props: PageProps<"/[locale]/admin">) {
  return <Suspense fallback={null}><AdminContent {...props} /></Suspense>;
}
