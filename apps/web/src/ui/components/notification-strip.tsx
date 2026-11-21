"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircleFill, ExclamationTriangleFill, InfoCircleFill, XOctagonFill } from "react-bootstrap-icons";
import { cx } from "@/ui/basic/styles";
import { Throbber } from "@/ui/basic";
import { useNotificationBell, useNotifications } from "./notification-provider";
import type { NotificationAnnouncement } from "./notification-store";

const icons = { success: CheckCircleFill, warning: ExclamationTriangleFill, error: XOctagonFill, info: InfoCircleFill };
const colors = { success: "--success", warning: "--warning", error: "--error", info: "--primary" };
const collapseMs = 180;
const flightMs = 320;
type Flight = { x: number; y: number; dx: number; dy: number };

function Announcement({ item, clear }: {
  item: NotificationAnnouncement;
  clear: (key: number) => void;
}) {
  const bell = useNotificationBell();
  const strip = useRef<HTMLDivElement>(null);
  const [exit, setExit] = useState<"fade" | "collapse" | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const Icon = icons[item.mode];
  const color = `var(${colors[item.mode]})`;

  useEffect(() => {
    if (item.pending) return;
    let phaseTimer: ReturnType<typeof setTimeout> | undefined;
    let endTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => clear(item.key);
    const timer = setTimeout(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        finish();
        return;
      }
      const origin = strip.current?.getBoundingClientRect();
      const target = bell.current?.getBoundingClientRect();
      const canFly = item.retained && origin && target && target.width > 0 && target.bottom > 0 &&
        target.top < window.innerHeight && origin.bottom > 0 && origin.top < window.innerHeight;
      if (!canFly) {
        setExit("fade");
        endTimer = setTimeout(finish, collapseMs);
        return;
      }
      const x = origin.right - 10;
      const y = origin.top + origin.height / 2;
      setExit("collapse");
      phaseTimer = setTimeout(() => {
        setFlight({ x, y, dx: target.left + target.width / 2 - x, dy: target.bottom - 4 - y });
        endTimer = setTimeout(finish, flightMs);
      }, collapseMs);
    }, Math.max(0, item.until - Date.now()));
    return () => { clearTimeout(timer); clearTimeout(phaseTimer); clearTimeout(endTimer); };
  }, [item, bell, clear]);

  return <>
    <div ref={strip} data-notification-strip data-mode={item.mode} data-exit={exit ?? undefined}
      data-pending={item.pending || undefined} aria-busy={item.pending || undefined}
      role={item.mode === "error" ? "alert" : "status"} aria-atomic="true" inert={exit !== null}
      className="notification-strip flex min-h-8 min-w-0 origin-right items-center justify-end gap-2 rounded-r-md border-r-2 px-3 py-1 text-right text-sm text-foreground"
      style={{ "--strip-color": color } as CSSProperties}>
      <div className="min-w-0 wrap-anywhere">{item.title && <strong className="mr-1">{item.title}</strong>}{item.message}</div>
      {item.progress?.percent !== undefined && <span className="shrink-0 font-semibold tabular-nums">{item.progress.percent}%</span>}
      {item.pending ? <Throbber size="sm" className="shrink-0 text-[hsl(var(--strip-color))]" />
        : <Icon aria-hidden="true" className="size-4 shrink-0 text-[hsl(var(--strip-color))]" />}
    </div>
    {flight && createPortal(<span aria-hidden="true" data-notification-flight className="notification-flight"
      style={{ left: flight.x, top: flight.y, "--strip-color": color, "--flight-x": `${flight.dx}px`,
        "--flight-y": `${flight.dy}px`, "--flight-duration": `${flightMs}ms` } as CSSProperties} />, document.body)}
  </>;
}

export function NotificationStrip({ children, className }: { children?: ReactNode; className?: string }) {
  const { announcement: latest, items, clearAnnouncement } = useNotifications();
  const pending = items.find(item => item.pending);
  const announcement = latest ?? (pending && { ...pending, key: pending.createdAt, until: 0, retained: true });
  if (!children && !announcement) return null;
  return <div className={cx("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1", className)}>
    {children}
    {announcement && <div className={cx("ml-auto min-w-0", children ? "w-full sm:w-auto sm:max-w-[58%] sm:flex-1" : "w-full")}>
      <Announcement key={announcement.key} item={announcement} clear={clearAnnouncement} />
    </div>}
  </div>;
}
