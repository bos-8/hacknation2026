"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/ui/basic";
import { Breadcrumb } from "@/ui/components/breadcrumb";
import { NotificationCenter } from "@/ui/components/notification-center";
import { NotificationProvider, useNotifications } from "@/ui/components/notification-provider";
import { NotificationStrip } from "@/ui/components/notification-strip";
import { NOTIFICATION_PRIORITY } from "@/ui/components/notification-store";

function DemoControls() {
  const t = useTranslations("test.notifications");
  const labels = useTranslations("common.notifications");
  const nav = useTranslations("common.navigation");
  const { pushNotification, removeNotification } = useNotifications();
  return <div data-notification-demo className="space-y-2">
    <div className="rounded-md border border-panel-border bg-panel">
      <div className="flex justify-end border-b border-panel-border px-3 py-1">
        <NotificationCenter ownerUuid="gallery-notification-preview" />
      </div>
      <NotificationStrip className="px-3 py-1">
        <Breadcrumb aria-label={nav("breadcrumb")} items={[{ label: nav("home"), href: "/" }, { label: t("title") }]} />
      </NotificationStrip>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" data-notification-saved onClick={() => pushNotification({ mode: "success", message: t("saved"), brief: true })}>{t("saved")}</Button>
      <Button size="sm" data-notification-updated onClick={() => pushNotification({ mode: "success", message: t("updated"), brief: true })}>{t("updated")}</Button>
      {NOTIFICATION_PRIORITY.map(mode => <Button size="sm" key={mode} data-notification-add={mode}
        onClick={() => pushNotification({ mode, title: labels(`modes.${mode}`), message: t(`examples.${mode}`), persistent: true })}>{labels(`modes.${mode}`)}</Button>)}
      <Button size="sm" data-notification-timed onClick={() => pushNotification({ mode: "info", message: t("timed"), autoCloseMs: 5000 })}>{t("timed")}</Button>
      <Button size="sm" data-notification-protected onClick={() => pushNotification({ id: "demo-operation", mode: "warning", message: t("protected"), dismissible: false })}>{t("protected")}</Button>
      <Button size="sm" data-notification-complete onClick={() => {
        removeNotification("demo-operation");
        pushNotification({ mode: "success", message: t("completed"), brief: true });
      }}>{t("complete")}</Button>
    </div>
  </div>;
}

/** Separate provider: gallery controls cannot affect the authenticated user's notification center. */
export function NotificationDemo() {
  return <NotificationProvider><DemoControls /></NotificationProvider>;
}
