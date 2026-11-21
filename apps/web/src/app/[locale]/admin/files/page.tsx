// Access is resolved at request time; the shared authenticated shell can block navigation.
export const instant = false;

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { parseFileListQuery } from "@/schemas/file-list";
import { requireAdminAccess } from "@/server/auth/admin-access";

import { FileCatalogView } from "./file-catalog-view";

async function FilesContent({ params, searchParams }: PageProps<"/[locale]/admin/files">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  await requireAdminAccess();
  const query = parseFileListQuery(await searchParams);
  return <FileCatalogView locale={locale} query={query} />;
}

export default function FilesPage(props: PageProps<"/[locale]/admin/files">) {
  return <Suspense fallback={null}><FilesContent {...props} /></Suspense>;
}
