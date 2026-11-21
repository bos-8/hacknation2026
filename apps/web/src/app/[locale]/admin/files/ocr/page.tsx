import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { parseFileVersion, parseOcrFileListQuery } from "@/schemas/file-list";
import { isAppLocale } from "@/schemas/i18n";
import { FileCatalogView } from "../file-catalog-view";
export const instant = false;

async function Content({ params, searchParams }: PageProps<"/[locale]/admin/files/ocr">) {
  await requireAdminAccess();
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const query = await searchParams;
  if (query.file === undefined && query.version === undefined)
    return <FileCatalogView locale={locale} query={parseOcrFileListQuery(query)} ocr />;
  const version = parseFileVersion(typeof query.version === "string" ? query.version : null);
  const file = z.uuid().safeParse(query.file);
  if (!file.success || !version) notFound();
  const mode = query.mode === "auto" ? "auto" : "manual";
  redirect(`/${locale}/admin/files/ocr/${file.data}?version=${version}&mode=${mode}`);
}

export default function Page(props: PageProps<"/[locale]/admin/files/ocr">) {
  return <Suspense><Content {...props} /></Suspense>;
}
