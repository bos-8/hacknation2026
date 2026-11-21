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
  return <section className="glass-shell mx-auto min-w-0 space-y-4 pb-8 pt-6 sm:pt-8" aria-labelledby="admin-title">
    <AdminSectionHeading title={t("title")} />
    <div data-admin-content className="glass-panel min-w-0 p-4 sm:p-6">{children}</div>
  </section>;
}

export default function AdminLayout(props: LayoutProps<"/[locale]/admin">) {
  return <Suspense fallback={<div className="flex justify-center p-8"><Throbber /></div>}>
    <AdminBoundary {...props} />
  </Suspense>;
}
