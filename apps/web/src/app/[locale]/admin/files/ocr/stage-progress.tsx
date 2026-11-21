"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { stageTime } from "@/schemas/stage-time";
import type { StageTiming } from "@/schemas/document-review";

// All visible progress bars share one clock. The initial timestamp is deterministic during hydration.
const listeners = new Set<() => void>();
let now = 0;
let interval: number | undefined;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    now = Date.now();
    interval = window.setInterval(() => {
      now = Date.now();
      listeners.forEach(notify => notify());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.clearInterval(interval);
  };
}
const readClock = () => now;
const serverClock = () => 0;

function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
}

export function StageProgress({ label, percent, timing }: { label: string; percent: number | null; timing: StageTiming }) {
  const t = useTranslations("common.documentReview");
  const clock = useSyncExternalStore(subscribe, readClock, serverClock);
  const { elapsed, remaining } = stageTime(timing, percent, clock || (timing.sampledAt ?? timing.startedAt ?? timing.queuedAt).getTime());
  return <span className="block min-w-0 space-y-1 text-start" data-stage-progress>
    <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold">
      <span>{label}</span><span className="text-xs tabular-nums">{percent === null ? t(timing.startedAt ? "working" : "inQueue") : `${percent}%`}</span>
    </span>
    <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}
      className="block h-2.5 w-full min-w-16 overflow-hidden rounded-full border border-input-border bg-muted">
      <span className={`block h-full rounded-full bg-primary ${percent === null ? "w-1/3 motion-safe:animate-pulse" : ""}`}
        style={percent === null ? undefined : { width: `${percent}%` }} />
    </span>
    <span aria-live="off" className="flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
      <span>{t(timing.startedAt ? "elapsed" : "waitingTime", { time: duration(elapsed) })}</span>
      <span>{remaining === null ? t(timing.startedAt ? "estimating" : "etaAfterStart") : t("remaining", { time: duration(remaining) })}</span>
    </span>
  </span>;
}
