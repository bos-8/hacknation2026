'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Activity, ArrowClockwise, ArrowRepeat, ArrowUpRight, Braces, Cloud, Cpu, Database, Globe, ListTask, ShieldLock } from 'react-bootstrap-icons';
import { SERVICES, type Service } from '@formiq/monitoring/contracts';
import type { QueueStateCounts } from '@formiq/queue/contracts';
import { currentHealth, systemHistory, type DashboardData } from '@/schemas/admin-dashboard';
import { Link } from '@/i18n/navigation';
import { Badge, Button, Heading, Throbber } from '@/ui/basic';
import { dashboardStyles as styles, monitoringTiming } from '@/ui/components/styles';
import { refreshDashboard } from './dashboard-actions';
import { HistoryRow } from './service-monitoring';

const icons = { web: Globe, backend: Braces, database: Database, keycloak: ShieldLock, storage: Cloud, queue_worker: ListTask, pyworker: Cpu };
const tones = { healthy: 'success', degraded: 'warning', error: 'danger', unknown: 'neutral', unconfigured: 'neutral' } as const;
type Metric = { key: string; value: string | number };
const queueMetrics = (counts: QueueStateCounts): Metric[] => [
  { key: 'jobs', value: counts.total }, { key: 'processing', value: counts.active },
  { key: 'waiting', value: counts.created }, { key: 'retrying', value: counts.retry },
  { key: 'completed', value: counts.completed }, { key: 'failed', value: counts.failed }, { key: 'cancelled', value: counts.cancelled },
];

function serviceMetrics(service: Service, data: DashboardData | null): Metric[] | null {
  if (!data) return null;
  switch (service) {
    case 'web': return data.application && [{ key: 'products', value: data.application.products }, { key: 'activeProducts', value: data.application.activeProducts }];
    case 'backend': return data.application && [{ key: 'files', value: data.application.files }, { key: 'versions', value: data.application.versions }, { key: 'tags', value: data.application.tags }];
    case 'database': return data.application && [{ key: 'localUsers', value: data.application.users }, { key: 'sessions', value: data.application.sessions }];
    case 'keycloak': return data.identity && [{ key: 'users', value: data.identity.total }, { key: 'enabledUsers', value: data.identity.enabled }];
    case 'storage': return data.storage && [{ key: 'objects', value: data.storage.objects }, { key: 'bytes', value: data.storage.bytes }];
    case 'queue_worker': return data.queue && queueMetrics(data.queue.all);
    case 'pyworker': return data.queue && queueMetrics(data.queue.python);
  }
}

function ServiceTile({ service, data, now, locale }: { service: Service; data: DashboardData | null; now: number; locale: string }) {
  const t = useTranslations('common.admin.dashboard');
  const monitoring = useTranslations('common.admin.monitoring');
  const row = data?.overview?.services.find(row => row.service === service);
  const status = currentHealth(row, now, data?.overview?.staleAfterMs);
  const metrics = serviceMetrics(service, data);
  const Icon = icons[service];
  const date = (value: Date | string) => new Date(value).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'medium' });
  const links = { web: '/admin/products', backend: '/admin/files', keycloak: '/admin/users', storage: '/admin/files', queue_worker: '/admin/queue', pyworker: '/admin/queue', database: '/admin/settings' } as const;
  return <article className={styles.tile} data-dashboard-service={service}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Heading level={3} className="flex items-center gap-2 text-base"><Icon className="size-4 text-muted-foreground" aria-hidden="true" />{monitoring(`services.${service}`)}</Heading>
      <Badge tone={tones[status]}>{monitoring(`statuses.${status}`)}</Badge>
    </div>
    <p className="mt-2 text-sm text-muted-foreground">{t(`descriptions.${service}`)}</p>
    <p className="mt-2 text-xs text-muted-foreground">{monitoring('lastChecked')}: {row?.lastCheckedAt ? <time dateTime={new Date(row.lastCheckedAt).toISOString()}>{date(row.lastCheckedAt)}</time> : '—'}
      {row?.responseMs !== null && row?.responseMs !== undefined && <span className="ml-2 tabular-nums">· {row.responseMs} ms</span>}</p>
    <p className="mt-1 text-xs text-muted-foreground">{monitoring(`reasons.${status === 'unknown' ? 'stale' : row?.reason ?? 'stale'}`)}</p>
    {metrics ? <dl className={styles.metrics}>{metrics.map(metric => <div key={metric.key} className="min-w-0">
      <dt className="text-xs text-muted-foreground">{t(`metrics.${metric.key}`)}</dt>
      <dd className={styles.value}>{new Intl.NumberFormat(locale).format(typeof metric.value === 'string' ? BigInt(metric.value) : metric.value)}</dd>
    </div>)}</dl> : <p className="my-5 text-sm text-muted-foreground">{t('statisticsUnavailable')}</p>}
    {service === 'storage' && data?.storage?.lastModified && <p className="mb-3 text-xs text-muted-foreground">{t('lastObject')}: <time dateTime={data.storage.lastModified}>{date(data.storage.lastModified)}</time></p>}
    {(service === 'queue_worker' || service === 'pyworker') && <p className="mb-3 text-xs text-muted-foreground">{t('retainedJobs')}</p>}
    <div className={styles.tileFooter}>
      <span className="text-xs text-muted-foreground">{t('statisticsAt')}: {metrics && data ? <time dateTime={data.collectedAt}>{date(data.collectedAt)}</time> : '—'}</span>
      <Link href={links[service]} className={styles.link}>{t('open')}<ArrowUpRight aria-hidden="true" /></Link>
    </div>
  </article>;
}

export function AdminDashboard({ locale }: { locale: string }) {
  const t = useTranslations('common.admin.dashboard');
  const monitoring = useTranslations('common.admin.monitoring');
  const [data, setData] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [now, setNow] = useState(0);
  const alive = useRef(false);
  const sequence = useRef(0);
  const running = useRef<number | null>(null);
  const load = useCallback(async () => {
    if (running.current !== null) return;
    const request = ++sequence.current;
    running.current = request;
    setBusy(true);
    try {
      const result = await refreshDashboard();
      if (!alive.current || running.current !== request) return;
      if (result.status === 'ok') { setData(result.dashboard); setFailed(false); }
      else { setFailed(true); if (result.status === 'denied') setData(null); }
    } catch { if (alive.current && running.current === request) setFailed(true); }
    finally {
      if (running.current === request) { running.current = null; if (alive.current) { setBusy(false); setNow(Date.now()); } }
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => setNow(Date.now()), monitoringTiming.refreshMs);
    return () => { alive.current = false; running.current = null; clearTimeout(initial); clearInterval(timer); };
  }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => { if (!document.hidden) void load(); }, monitoringTiming.refreshMs);
    const visible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [autoRefresh, load]);
  const overview = data?.overview;
  const history = overview && systemHistory(overview, now);
  return <section className="mt-6 min-w-0" aria-label={t('title')}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Heading level={3} className="flex items-center gap-2 text-lg"><Activity aria-hidden="true" />{t('availability')}</Heading>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/monitoring" className={styles.link}>{t('monitoring')}<ArrowUpRight aria-hidden="true" /></Link>
        <span className="mx-1 h-5 border-l border-border" aria-hidden="true" />
        <Button tone={autoRefresh ? 'primary' : 'main-outline'} size="sm" tooltip={monitoring(autoRefresh ? 'autoOff' : 'autoOn')} aria-label={monitoring('autoRefresh')} aria-pressed={autoRefresh} onClick={() => setAutoRefresh(value => !value)}><ArrowRepeat aria-hidden="true" /></Button>
        <Button tone="main-outline" size="sm" tooltip={monitoring('refresh')} aria-label={monitoring('refresh')} disabled={busy} onClick={() => void load()}><ArrowClockwise className={busy ? 'animate-spin' : ''} aria-hidden="true" /></Button>
      </div>
    </div>
    <p className="mt-2 text-sm text-muted-foreground">{t('availabilityDescription')}</p>
    {failed && <p role="alert" className="mt-3 text-sm text-danger">{t('error')}</p>}
    {data && !overview && <p role="alert" className="mt-3 text-sm text-danger">{t('historyUnavailable')}</p>}
    <div aria-busy={busy} className="mt-2 min-h-28" data-system-availability>
      {history && overview ? <><HistoryRow row={failed ? { ...history, status: 'unknown' } : history} locale={locale} stale={false} hours={overview.hours} /><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{monitoring('hoursAgo', { count: overview.hours })}</span><span>{monitoring('now')}</span></div></> :
        <div className="flex min-h-28 items-center justify-center text-sm text-muted-foreground">{busy ? <Throbber /> : monitoring('statuses.unknown')}</div>}
    </div>
    <div className={styles.grid} aria-busy={busy}>
      {SERVICES.map(service => <ServiceTile key={service} service={service} locale={locale} data={data} now={now} />)}
    </div>
  </section>;
}
