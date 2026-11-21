import { Suspense } from "react";
import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { requireAdminAccess } from "@/server/auth/admin-access";

export const instant = false;

async function LegacySettings({ params }: PageProps<"/[locale]/admin/settings/llm">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  await requireAdminAccess();
  return redirect({ href: "/chat/settings", locale });
}

export default function Page(props: PageProps<"/[locale]/admin/settings/llm">) {
  return <Suspense fallback={null}><LegacySettings {...props} /></Suspense>;
}
