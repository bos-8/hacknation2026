// Access is resolved at request time; the shared authenticated shell can block navigation.
export const instant = false;

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { parseTagQuery } from "@/schemas/tag";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { Heading } from "@/ui/basic";
import { TagsResults } from "./tags-results";

async function TagsContent({ params, searchParams }: PageProps<"/[locale]/admin/tags">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  await requireAdminAccess();
  const t = await getTranslations({ locale, namespace: "common.admin.tags" });
  return <article className="min-w-0 space-y-1" aria-labelledby="tags-title">
    <Heading level={2} id="tags-title" className="pb-4 text-xl">{t("title")}</Heading>
    <TagsResults locale={locale} initialQuery={parseTagQuery(await searchParams)} />
  </article>;
}
export default function TagsPage(props: PageProps<"/[locale]/admin/tags">) {
  return <Suspense fallback={null}><TagsContent {...props} /></Suspense>;
}
