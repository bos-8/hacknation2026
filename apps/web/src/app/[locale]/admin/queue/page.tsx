// Access is resolved at request time; the shared authenticated shell can block navigation.
export const instant = false;

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { parseQueueQuery } from "@/schemas/queue";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { Heading } from "@/ui/basic";
import { QueueResults } from "./queue-results";

async function QueueContent({ params, searchParams }: PageProps<"/[locale]/admin/queue">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  await requireAdminAccess();
  const t = await getTranslations({ locale, namespace: "common.admin.queue" });
  return <article className="min-w-0 space-y-1" aria-labelledby="queue-title">
    <Heading level={2} id="queue-title" className="pb-4 text-xl">{t("title")}</Heading>
    <QueueResults locale={locale} initialQuery={parseQueueQuery(await searchParams)} />
  </article>;
}
export default function QueuePage(props: PageProps<"/[locale]/admin/queue">) {
  return <Suspense fallback={null}><QueueContent {...props} /></Suspense>;
}
