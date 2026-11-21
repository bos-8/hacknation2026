"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Bell, BellFill, CheckCircleFill, ExclamationTriangleFill, InfoCircleFill, Trash, X, XOctagonFill } from "react-bootstrap-icons";
import { Button, Tooltip } from "@/ui/basic";
import { CornerBadge } from "./corner-badge";
import { useHydrated } from "./use-hydrated";
import { useNotificationBell, useNotificationOwner, useNotifications } from "./notification-provider";
import { NOTIFICATION_PRIORITY, notificationSummary, type NotificationItem } from "./notification-store";
import { notificationStyles as styles } from "./styles";
import { OverlayAside } from "./aside";

const icons = { error: XOctagonFill, warning: ExclamationTriangleFill, success: CheckCircleFill, info: InfoCircleFill };
const badgeColors = { error: "red", warning: "amber", success: "green", info: "blue" } as const;
const pulseColors = { error: "--error", warning: "--warning", success: "--success", info: "--primary" };

function NotificationRow({ item }: { item: NotificationItem }) {
  const t = useTranslations("common.notifications");
  const { closeNotification, pauseNotification } = useNotifications();
  const Icon = icons[item.mode];
  return <article data-notification-id={item.id} data-mode={item.mode} className={styles.item} role={item.mode === "error" ? "alert" : "status"}
    onMouseEnter={() => pauseNotification(item.id, "hover", true)} onMouseLeave={() => pauseNotification(item.id, "hover", false)}
    onFocusCapture={() => pauseNotification(item.id, "focus", true)} onBlurCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) pauseNotification(item.id, "focus", false);
    }}>
    <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${styles.icons[item.mode]}`} />
    <div className="min-w-0 flex-1 break-words">
      {item.title && <h3 className="text-sm font-semibold">{item.title}</h3>}
      <div className="text-sm">{item.message}</div>
      <p aria-hidden="true" className="mt-2 text-xs text-muted-foreground">{item.dismissible === false ? t("protected") : item.remainingMs === null ? t("persistent") : t("expiresIn", { seconds: Math.ceil(item.remainingMs / 1000) })}</p>
    </div>
    {item.dismissible !== false && <Tooltip content={t("dismiss")} placement="left" topLayer>
      <Button size="sm" tone="danger-outline" aria-label={t("dismiss")} className={styles.iconButton} onClick={() => closeNotification(item.id)}><X className="size-4" /></Button>
    </Tooltip>}
  </article>;
}

/** Mount only for a server-verified user; owner binding isolates notification lifetimes. */
export function NotificationCenter({ ownerUuid }: { ownerUuid: string }) {
  useNotificationOwner(ownerUuid);
  const bell = useNotificationBell();
  const notifications = useNotifications();
  const { clearNotifications, pauseNotification } = notifications;
  const items = notifications.owner === ownerUuid ? notifications.items : [];
  const pulse = notifications.owner === ownerUuid ? notifications.pulse : null;
  const t = useTranslations("common.notifications");
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const ready = useHydrated();
  const { counts, dominant } = notificationSummary(items);
  const BellIcon = items.length ? BellFill : Bell;
  const close = () => {
    setOpen(false);
    for (const item of items) { pauseNotification(item.id, "hover", false); pauseNotification(item.id, "focus", false); }
  };
  const toggle = () => { if (open) close(); else setOpen(true); };
  return <>
    <span ref={bell} className="relative inline-flex shrink-0" data-notification-trigger>
      <Tooltip content={t("label")} placement="bottom">
        <Button ref={trigger} disabled={!ready} size="sm" onClick={toggle} aria-controls={`${id}-notifications`}
          aria-haspopup="dialog" aria-expanded={open} aria-label={items.length ? t("labelWithCount", { count: items.length }) : t("label")}
          data-filled={items.length > 0} data-expanded={open} className={styles.trigger}>
          {pulse && <span key={pulse.key} aria-hidden="true" className={styles.pulse}
            style={{ "--notification-pulse": `var(${pulseColors[pulse.mode]})` } as CSSProperties} />}
          <BellIcon aria-hidden="true" className="relative size-4" />
        </Button>
      </Tooltip>
      {items.length > 0 && <CornerBadge aria-hidden="true" value={items.length > 99 ? "99+" : items.length} color={badgeColors[dominant]} className="right-1 top-1 h-4 min-w-4 w-auto px-1" />}
    </span>
    <OverlayAside open={open} onClose={close} triggerRef={trigger} id={`${id}-notifications`} data-notification-panel
      closeLabel={t("close")} icon={<BellIcon aria-hidden="true" className={styles.headerIcon} />}
      title={<>{t("title")}{items.length > 0 && <span className="ml-2 text-muted-foreground">{items.length}</span>}</>}
      description={items.length ? NOTIFICATION_PRIORITY.filter(mode => counts[mode]).map(mode => `${t(`modes.${mode}`)}: ${counts[mode]}`).join(", ") : t("noActive")}
      actions={items.length > 0 && <Tooltip content={t("clear")} placement="bottom" topLayer><Button size="sm" aria-label={t("clear")}
        disabled={!items.some(item => item.dismissible !== false)} className={styles.iconButton} onClick={clearNotifications}><Trash className="size-4" /></Button></Tooltip>}
      bodyClassName="p-0">
      <div className={styles.bodyContent}>
        {items.length ? items.map(item => <NotificationRow key={item.id} item={item} />)
          : <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>}
      </div>
    </OverlayAside>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{items.length ? t("labelWithCount", { count: items.length }) : ""}</span>
  </>;
}
