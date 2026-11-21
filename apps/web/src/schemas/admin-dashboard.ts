import { SERVICES, STALE_AFTER_MS, type DisplayHealthStatus, type HealthOverview, type ServiceHistory } from '@formiq/monitoring/contracts';
import type { QueueSummary } from '@formiq/queue/contracts';

export type ApplicationSummary = { products: number; activeProducts: number; files: number; versions: number; tags: number; users: number; sessions: number };
export type DashboardData = {
  collectedAt: string;
  overview: HealthOverview | null;
  application: ApplicationSummary | null;
  storage: { objects: number; bytes: string; lastModified: string | null } | null;
  identity: { total: number; enabled: number } | null;
  queue: QueueSummary | null;
};
export type SystemHistory = Omit<ServiceHistory, 'service'> & { service: 'system' };

export function combinedHealth(statuses: DisplayHealthStatus[]): DisplayHealthStatus {
  if (!statuses.length) return 'unknown';
  if (statuses.includes('error')) return 'error';
  if (statuses.includes('unknown')) return 'unknown';
  if (statuses.every(status => status === 'unconfigured')) return 'unconfigured';
  if (statuses.some(status => status === 'degraded' || status === 'unconfigured')) return 'degraded';
  return 'healthy';
}

export function currentHealth(row: ServiceHistory | undefined, now: number, staleAfterMs = STALE_AFTER_MS): DisplayHealthStatus {
  return !row?.lastCheckedAt || now - new Date(row.lastCheckedAt).getTime() > staleAfterMs ? 'unknown' : row.status;
}

/** One system bar; missing/stale services can never turn the system green. */
export function systemHistory(overview: HealthOverview, now: number): SystemHistory {
  const rows = SERVICES.map(service => overview.services.find(row => row.service === service));
  const template = rows.find(row => row?.buckets.length)?.buckets ?? [];
  const timestamps = rows.map(row => row?.lastCheckedAt ? new Date(row.lastCheckedAt).getTime() : null);
  return {
    service: 'system', reason: 'system_overview',
    status: combinedHealth(rows.map(row => currentHealth(row, now, overview.staleAfterMs))),
    lastCheckedAt: timestamps.every(time => time !== null) ? new Date(Math.min(...timestamps as number[])) : null,
    responseMs: null,
    buckets: template.map((bucket, index) => {
      const samples = rows.map(row => row?.buckets[index]);
      return { ...bucket, status: combinedHealth(samples.map(sample => sample?.status ?? 'unknown')),
        count: Math.min(...samples.map(sample => sample?.count ?? 0)), averageMs: null };
    }),
  };
}
