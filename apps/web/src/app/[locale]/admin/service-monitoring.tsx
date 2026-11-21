"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowClockwise, ArrowRepeat } from "react-bootstrap-icons";
import { SERVICES, HISTORY_WINDOWS, DEFAULT_HISTORY_HOURS, STALE_AFTER_MS, isHistoryHours, type HistoryHours, type HealthOverview, type DisplayHealthStatus, type ServiceHistory } from "@formiq/monitoring/contracts";
import { Badge, Button, Heading, Select, Throbber, Tooltip } from "@/ui/basic";
import { monitoringStyles as styles, monitoringTiming } from "@/ui/components/styles";
import { refreshMonitoring } from "./monitoring-actions";
import type { SystemHistory } from '@/schemas/admin-dashboard';

export function HistoryRow({ row, locale, stale, hours }: { row: ServiceHistory | SystemHistory; locale: string; stale: boolean; hours: HistoryHours }) {
  const t = useTranslations("common.admin.monitoring");
  const [focus, setFocus] = useState(row.buckets.length - 1);
  const divisions = hours / HISTORY_WINDOWS[hours].divisionHours;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const format = (date: Date) => new Date(date).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
  const status: DisplayHealthStatus = stale ? "unknown" : row.status;
  const tone = { healthy: "success", degraded: "warning", error: "danger", unknown: "neutral", unconfigured: "neutral" } as const;
  return <div className={styles.row} data-service={row.service} data-history-hours={hours}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium">{t(`services.${row.service}`)}</span>
      <Tooltip content={`${t(`reasons.${stale ? "stale" : row.reason}`)}${row.lastCheckedAt ? ` · ${format(row.lastCheckedAt)}` : ""}${row.responseMs !== null ? ` · ${row.responseMs} ms` : ""}`}>
        <Badge tone={tone[status]}>{t(`statuses.${status}`)}</Badge>
      </Tooltip>
    </div>
    <p className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>{t("lastChecked")}: {row.lastCheckedAt ? <time dateTime={new Date(row.lastCheckedAt).toISOString()}>{format(row.lastCheckedAt)}</time> : "—"}</span>
      {row.service !== 'system' && <span>{t("responseTime")}: {row.responseMs !== null ? `${row.responseMs} ms` : "—"}</span>}
    </p>
    <div className="relative">
    <div className={styles.timeline} role="group" aria-label={t("historyFor", { service: t(`services.${row.service}`) })}>
      {row.buckets.map((bucket, index) => {
        const hint = `${format(bucket.from)} – ${format(bucket.to)} · ${t(`statuses.${bucket.status}`)} · ${t("samples", { count: bucket.count })}${bucket.averageMs !== null ? ` · ${bucket.averageMs} ms` : ""}`;
        return <Tooltip key={index} content={hint} className="flex min-w-0 flex-1">
          <button ref={node => { buttons.current[index] = node; }} type="button" tabIndex={focus === index ? 0 : -1}
            aria-label={hint} className={`${styles.tick} ${styles.colors[bucket.status]}`} onFocus={() => setFocus(index)}
            onKeyDown={event => {
              const next = event.key === "Home" ? 0 : event.key === "End" ? row.buckets.length - 1 : event.key === "ArrowLeft" ? Math.max(0, index - 1) : event.key === "ArrowRight" ? Math.min(row.buckets.length - 1, index + 1) : null;
              if (next !== null) { event.preventDefault(); buttons.current[next]?.focus(); }
            }} />
        </Tooltip>;
      })}
    </div>
    <div aria-hidden="true" className={styles.divisions}>{Array.from({ length: divisions - 1 }, (_, index) => <span key={index} className={styles.division} style={{ left: `${(index + 1) / divisions * 100}%` }} />)}</div>
    </div>
  </div>;
}

export function ServiceMonitoring({ locale }: { locale: string }) {
  const t = useTranslations("common.admin.monitoring");
  const [overview, setOverview] = useState<HealthOverview | null>(null);
  const [hours, setHours] = useState<HistoryHours>(DEFAULT_HISTORY_HOURS);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [now, setNow] = useState(0);
  const running = useRef<number | null>(null);
  const sequence = useRef(0);
  const alive = useRef(false);
  const load = useCallback(async () => {
    if (running.current !== null) return;
    const request = ++sequence.current;
    running.current = request;
    setBusy(true);
    try {
      const result = await refreshMonitoring(hours);
      if (!alive.current || request !== running.current) return;
      if (result.status === "ok") { setOverview(result.overview); setFailed(false); }
      else setFailed(true);
    } catch { if (alive.current && request === running.current) setFailed(true); }
    finally { if (request === running.current) { running.current = null; if (alive.current) { setBusy(false); setNow(Date.now()); } } }
  }, [hours]);
  useEffect(() => {
    alive.current = true;
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => setNow(Date.now()), monitoringTiming.refreshMs);
    return () => { alive.current = false; running.current = null; clearTimeout(initial); clearInterval(timer); };
  }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => { if (!document.hidden) void load(); }, monitoringTiming.refreshMs);
    const visible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", visible);
    return () => { clearTimeout(initial); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [autoRefresh, load]);
  const displayedHours = overview?.hours ?? hours;
  const divisions = displayedHours / HISTORY_WINDOWS[displayedHours].divisionHours;
  return <section aria-labelledby="monitoring-title" className="mt-6 min-w-0">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
      <Heading level={3} id="monitoring-title" className="text-lg">{t("title")}</Heading>
      <div className="flex items-center gap-2">
        <label htmlFor="monitoring-hours" className="text-sm text-muted-foreground">{t("range")}</label>
        <Select id="monitoring-hours" value={hours} className="h-8 w-auto text-sm" onChange={event => { const next = Number(event.target.value); if (isHistoryHours(next)) setHours(next); }}>
          {Object.keys(HISTORY_WINDOWS).map(value => <option key={value} value={value}>{t(`ranges.${value}`)}</option>)}
        </Select>
        <Button tone={autoRefresh ? "primary" : "main-outline"} size="sm" tooltip={t(autoRefresh ? "autoOff" : "autoOn")} aria-label={t("autoRefresh")} aria-pressed={autoRefresh} onClick={() => setAutoRefresh(current => !current)}><ArrowRepeat aria-hidden="true" /></Button>
        <span className="h-5 border-l border-border" aria-hidden="true" />
        <Button tone="main-outline" size="sm" tooltip={t("refresh")} aria-label={t("refresh")} disabled={busy} onClick={() => void load()}><ArrowClockwise className={busy ? "animate-spin" : ""} aria-hidden="true" /></Button>
      </div>
    </div>
    <p className="text-sm text-muted-foreground">{t("description", { minutes: HISTORY_WINDOWS[displayedHours].bucketMinutes })}</p>
    <p className="mb-4 mt-1 text-xs tabular-nums text-muted-foreground">
      {t("lastSynchronized")}: {overview ? <time dateTime={new Date(overview.collectedAt).toISOString()}>{new Date(overview.collectedAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "medium" })}</time> : "—"}
    </p>
    {failed && <p role="alert" className="mb-3 text-sm text-danger">{t("error")}</p>}
    <div aria-busy={busy} className={`min-h-64 ${busy && overview ? "opacity-50" : ""}`}>
      {!overview && busy ? <div className="flex min-h-64 items-center justify-center"><Throbber /></div> :
        SERVICES.map(service => {
          const row = overview?.services.find(row => row.service === service);
          return row ? <HistoryRow key={`${service}-${overview?.hours}`} row={row} locale={locale} hours={displayedHours} stale={!row.lastCheckedAt || now - new Date(row.lastCheckedAt).getTime() > (overview?.staleAfterMs ?? STALE_AFTER_MS)} /> :
            <div key={service} className={styles.row}><span className="text-sm">{t(`services.${service}`)}</span><span className="float-right text-sm text-muted-foreground">{t("statuses.unknown")}</span><div className="mt-2 h-6 bg-muted/40" /></div>;
        })}
    </div>
    <div className={styles.axis} aria-hidden="true">{Array.from({ length: divisions + 1 }, (_, index) => {
      const remaining = displayedHours - index * HISTORY_WINDOWS[displayedHours].divisionHours;
      return <span key={index} className={index === 0 ? "absolute left-0" : index === divisions ? "absolute right-0" : "absolute -translate-x-1/2"} style={index > 0 && index < divisions ? { left: `${index / divisions * 100}%` } : undefined}>
        {remaining === 0 ? t("now") : displayedHours === 168 ? t("daysAgo", { count: remaining / 24 }) : t("hoursAgo", { count: remaining })}
      </span>;
    })}</div>
    <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">{(["healthy", "degraded", "error", "unknown", "unconfigured"] as const).map(status => <span key={status} className="inline-flex items-center gap-2"><span aria-hidden="true" className={`h-3 w-1.5 rounded-sm ${styles.colors[status]}`} />{t(`statuses.${status}`)}</span>)}</div>
  </section>;
}
