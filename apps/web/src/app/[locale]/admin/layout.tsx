import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { requireAccess } from "@/server/auth/access";
import { ADMIN_ACCESS } from "@/schemas/access";
import { AdminSectionHeading } from "./section-heading";
import { Throbber } from "@/ui/basic";

async function AdminBoundary({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  await requireAccess(ADMIN_ACCESS);
  const t = await getTranslations({ locale, namespace: "common.admin" });
  return <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6" aria-labelledby="admin-title">
    <AdminSectionHeading title={t("title")} />
    {children}
  </section>;
}

export default function AdminLayout(props: LayoutProps<"/[locale]/admin">) {
  return <Suspense fallback={<div className="flex justify-center p-8"><Throbber /></div>}>
    <AdminBoundary {...props} />
  </Suspense>;
}
