"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { BoxArrowRight, ChevronDown, Person, PersonGear, ShieldLock } from "react-bootstrap-icons";
import { Link } from "@/i18n/navigation";
import { ADMIN_ROLES } from "@/schemas/session";
import type { AppLocale } from "@/schemas/i18n";
import { Anchor, Button, Separator, Throbber } from "@/ui/basic";
import { Popup } from "./popup";
import { userPanelV2Styles } from "./styles";
import { Blur } from "./blur";
import { useHydrated } from "./use-hydrated";
import type { SessionStatus } from "@/schemas/session";
import { useSessionLifecycle } from "./use-session-lifecycle";
import { SessionDetails } from "./session-details";
import { SessionWarning } from "./session-warning";
import { SessionLogoutProgress } from "./session-logout-progress";
import { CornerBadge } from "./corner-badge";

type UserIdentityProps = {
  locale: AppLocale;
  displayName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  image?: string | null;
  expiresAt: string;
  accountUrl: string;
};

export type UserPanelProps = UserIdentityProps & (
  { preview: true; lifecycle?: SessionStatus } |
  { preview?: false; lifecycle: SessionStatus }
);

/** Session presentation only; logout and account management remain server-owned. */
export function UserPanel({ locale, displayName, firstName, lastName, email, image, expiresAt, accountUrl,
  preview = false, lifecycle, variant = "v1" }: UserPanelProps & { variant?: "v1" | "v2" }) {
  const t = useTranslations("common.userPanel");
  const auth = useTranslations("common.auth");
  const sessionLabels = useTranslations("common.session");
  const session = useSessionLifecycle(lifecycle ?? { expiresAt,
    sessionUuid: "00000000-0000-7000-8000-000000000001", userUuid: "00000000-0000-7000-8000-000000000002",
    serverTime: new Date(Date.parse(expiresAt) - 900000).toISOString(), warningSeconds: 120, ttlSeconds: 900,
    autoRefresh: false, refreshes: 0, maxRefreshes: 3, roles: [] }, preview);
  const ready = useHydrated();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelHeader = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"closed" | "identity" | "expanded" | "collapsing" | "closing">("closed");
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const pending = session.logoutPending;
  const givenName = firstName?.trim();
  const familyName = lastName?.trim();
  const fullName = [givenName, familyName].filter(Boolean).join(" ") || displayName;
  const triggerLabel = givenName || email || displayName;
  const animated = variant === "v2";
  const expanded = phase === "identity" || phase === "expanded" || phase === "collapsing";
  const detailsExpanded = phase === "expanded";
  const closeLogout = () => {
    if (pending) return;
    setLogoutOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const minimize = useCallback(() => {
    if (!animated) { panel.current?.hidePopover(); return; }
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("closed");
      panel.current?.hidePopover();
    } else if (phase === "expanded") {
      setPhase("collapsing");
      closeTimer.current = setTimeout(() => {
        setPhase("closing");
        closeTimer.current = setTimeout(() => panel.current?.hidePopover(), 200);
      }, 200);
    } else {
      setPhase("closing");
      closeTimer.current = setTimeout(() => panel.current?.hidePopover(), 200);
    }
  }, [animated, phase]);

  useEffect(() => () => { clearTimeout(closeTimer.current); clearTimeout(openTimer.current); }, []);

  const positionPanel = useCallback(() => {
    if (!trigger.current || !panel.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    if (animated) {
      const viewport = document.documentElement.clientWidth;
      const width = Math.min(anchor.width + 200, viewport - 16);
      const top = Math.max(8, anchor.top);
      const variables = {
        "--user-panel-left": `${Math.max(8, Math.min(anchor.left, viewport - anchor.width - 8))}px`,
        "--user-panel-open-left": `${Math.max(8, Math.min(anchor.right - width, viewport - width - 8))}px`,
        "--user-panel-width": `${width}px`,
      };
      for (const [name, value] of Object.entries(variables)) panel.current.style.setProperty(name, value);
      Object.assign(panel.current.style, { top: `${top}px`,
        maxHeight: `${Math.max(0, window.innerHeight - top - 8)}px`,
      });
      return;
    }
    const width = Math.min(320, document.documentElement.clientWidth - 16);
    const top = anchor.bottom + 8;
    Object.assign(panel.current.style, {
      width: `${width}px`, top: `${top}px`,
      left: `${Math.max(8, Math.min(anchor.left + (anchor.width - width) / 2, document.documentElement.clientWidth - width - 8))}px`,
      maxHeight: `${Math.max(0, window.innerHeight - top - 8)}px`,
    });
  }, [animated]);

  useEffect(() => {
    if (!open || !animated) return;
    const frame = requestAnimationFrame(() => {
      panelHeader.current?.focus({ preventScroll: true });
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPhase("expanded");
      else {
        setPhase("identity");
        openTimer.current = setTimeout(() => setPhase("expanded"), 200);
      }
    });
    return () => { cancelAnimationFrame(frame); clearTimeout(openTimer.current); };
  }, [open, animated]);

  useEffect(() => {
    if (!open || !animated || phase === "closing" || phase === "collapsing") return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) minimize();
    };
    const escape = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); minimize(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open, animated, phase, minimize]);

  useEffect(() => {
    if (!open) return;
    positionPanel();
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
    };
  }, [open, positionPanel]);

  return <>
    <span className="relative inline-flex shrink-0">
    <Button ref={trigger} size="sm" popoverTarget={`${id}-panel`} aria-controls={`${id}-panel`}
      disabled={!ready} aria-busy={!ready} data-expanded={animated && open} aria-expanded={animated ? expanded : open} aria-label={t("label")}
      className={animated ? userPanelV2Styles.trigger : "w-[150px] shrink-0 justify-between"}>
      {image && failedImage !== image ? <Image src={image} alt="" width={16} height={16} unoptimized onError={() => setFailedImage(image)} className="size-4 shrink-0 rounded-full object-cover" /> : <Person aria-hidden="true" className="size-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate text-left" title={triggerLabel}>{triggerLabel}</span>
      <ChevronDown aria-hidden="true" className={`size-3 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
    </Button>
    {session.warning && !open && <CornerBadge data-session-badge value={session.time} placement="top-right" color="amber"
      aria-label={sessionLabels("warningMessage", { time: session.time })} />}
    </span>
    <Blur className={animated && (phase === "identity" || phase === "expanded") ? userPanelV2Styles.backdrop : userPanelV2Styles.clearBackdrop}>
    <div ref={panel} id={`${id}-panel`} popover={animated ? "manual" : "auto"} role="region" aria-label={t("label")}
      data-user-panel={variant} data-wide={expanded} data-phase={phase}
      onBeforeToggle={event => {
        if (event.newState === "open") { clearTimeout(closeTimer.current); positionPanel(); setPhase("closed"); }
      }}
      onToggle={event => {
        setOpen(event.newState === "open");
        if (event.newState === "closed") {
          setPhase("closed");
          if (animated && !logoutOpen && (document.activeElement === document.body || panel.current?.contains(document.activeElement))) {
            requestAnimationFrame(() => trigger.current?.focus());
          }
        }
      }}
      className={animated ? userPanelV2Styles.frame : "fixed inset-auto m-0 overflow-y-auto rounded-lg border border-panel-border bg-panel p-4 text-panel-foreground shadow-panel"}>
      {animated ? <Button ref={panelHeader} aria-expanded={expanded} aria-controls={`${id}-body`} aria-label={t("label")}
        data-expanded={expanded} className={userPanelV2Styles.header} onClick={minimize}>
        <span data-expanded={expanded} className={userPanelV2Styles.avatar}>
          {image && failedImage !== image ? <Image src={image} alt="" width={48} height={48} unoptimized onError={() => setFailedImage(image)} className="size-full object-cover" /> : <Person aria-hidden="true" className={userPanelV2Styles.icon} />}
        </span>
        <span className={userPanelV2Styles.identity}>
          <span className={userPanelV2Styles.name} title={fullName}>{expanded ? fullName : triggerLabel}</span>
          {email && <span data-expanded={expanded} className={userPanelV2Styles.email} title={email}>{email}</span>}
        </span>
        <ChevronDown aria-hidden="true" data-expanded={expanded} className={userPanelV2Styles.chevron} />
      </Button> : <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
          {image && failedImage !== image ? <Image src={image} alt="" width={40} height={40} unoptimized onError={() => setFailedImage(image)} className="size-10 object-cover" /> : <Person aria-hidden="true" className="size-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("signedInAs")}</p>
          <p className="mt-0.5 break-words text-sm font-semibold">{fullName}</p>
        </div>
      </div>}
      <div id={`${id}-body`} data-expanded={detailsExpanded} inert={animated && !detailsExpanded} className={animated ? userPanelV2Styles.body : undefined}>
      <div className={animated ? userPanelV2Styles.bodyClip : undefined}>
      <div className={animated ? userPanelV2Styles.bodyContent : undefined}>
      {(email || givenName || familyName) && <>
        <Separator className="my-3" />
        <dl className="divide-y divide-border text-xs">
          {givenName && <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 py-2 first:pt-0 last:pb-0"><dt className="text-muted-foreground">{t("firstName")}</dt><dd className="break-words text-right font-medium">{givenName}</dd></div>}
          {familyName && <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 py-2 first:pt-0 last:pb-0"><dt className="text-muted-foreground">{t("lastName")}</dt><dd className="break-words text-right font-medium">{familyName}</dd></div>}
          {email && <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 py-2 first:pt-0 last:pb-0"><dt className="text-muted-foreground">{t("email")}</dt><dd className="break-all text-right font-medium">{email}</dd></div>}
        </dl>
      </>}
      <SessionDetails session={session} />
      <Separator className="my-3" />
      <div className="grid gap-2">
        {!session.expired && ADMIN_ROLES.some(role => session.roles?.includes(role)) &&
          <><Link href="/admin" locale={locale} aria-disabled={preview || undefined}
            onClick={event => { if (preview) event.preventDefault(); else minimize(); }}
            className="flex min-h-9 items-center justify-center gap-2 rounded-md border border-button-border px-3 py-2 text-sm font-semibold no-underline hover:bg-button-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-ring">
            <ShieldLock aria-hidden="true" className="size-4 shrink-0" />{t("admin")}
          </Link><Separator className="my-1" /></>}
        <Anchor href={accountUrl} aria-disabled={preview || session.expired || undefined} onClick={event => { if (preview || session.expired) event.preventDefault(); else minimize(); }}
          className="flex min-h-9 items-center justify-center gap-2 rounded-md border border-button-border px-3 py-2 text-sm font-semibold no-underline hover:bg-button-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-ring">
          <PersonGear aria-hidden="true" className="size-4 shrink-0" />{t("account")}
        </Anchor>
        <Separator className="my-1" />
        <Button tone="danger-outline" disabled={pending || session.pending} onClick={() => {
          session.clearLogoutError();
          minimize();
          setLogoutOpen(true);
        }}>
          <BoxArrowRight aria-hidden="true" className="size-4 shrink-0" />{auth("signOut")}
        </Button>
      </div>
      </div></div></div>
    </div></Blur>
    {session.automaticLogout ? <SessionLogoutProgress onReady={session.logoutProgressReady} /> : <>
    {!logoutOpen && <SessionWarning session={session} />}
    {logoutOpen && <Popup title={auth("signOut")} disableClose={pending}
      onClose={closeLogout}
      content={<div aria-busy={pending}>
        <p role={pending ? "status" : undefined}>{pending ? sessionLabels("loggingOut") : t("logoutConfirm")}</p>
        {session.logoutError && <p role="alert" className="mt-3 text-danger">{t("logoutError")}</p>}
      </div>}
      actions={<>
        <Button tone="main-outline" disabled={pending} autoFocus onClick={closeLogout}>{t("cancel")}</Button>
        <Button tone="danger-outline" disabled={pending || preview} aria-busy={pending} onClick={() => void session.hardSignOut()}>
          {pending ? <Throbber size="sm" label={sessionLabels("loggingOut")} /> : auth("signOut")}
        </Button>
      </>} />}
    </>}
  </>;
}
