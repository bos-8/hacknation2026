"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { pageBreadcrumbs } from "@/config/navigation";
import { Breadcrumb } from "@/ui/components/breadcrumb";
import { NotificationStrip } from "@/ui/components/notification-strip";

export function PageBreadcrumb() {
  const pathname = usePathname();
  const t = useTranslations("common.navigation");
  const items = pageBreadcrumbs(pathname);
  return <NotificationStrip className="shell-breadcrumb relative z-30 mx-auto w-full max-w-7xl bg-background px-4 pt-1 sm:px-6">
    {items.length > 0 && <Breadcrumb aria-label={t("breadcrumb")} items={items.map(item => ({ ...item, label: t(item.label) }))} />}
  </NotificationStrip>;
}
