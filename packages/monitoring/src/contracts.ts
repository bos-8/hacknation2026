export const SERVICES = ["web", "backend", "database", "keycloak", "storage", "queue_worker", "pyworker"] as const;
export type Service = typeof SERVICES[number];
export type HealthStatus = "healthy" | "degraded" | "error" | "unconfigured";
export type DisplayHealthStatus = HealthStatus | "unknown";
export const RETENTION_MS = 7 * 86400 * 1000;
export const SAMPLE_INTERVAL_MS = 60 * 1000;
export const STALE_AFTER_MS = 3 * SAMPLE_INTERVAL_MS;
export const HISTORY_WINDOWS = {
  8: { bucketMinutes: 5, divisionHours: 1 },
  24: { bucketMinutes: 15, divisionHours: 4 },
  72: { bucketMinutes: 60, divisionHours: 12 },
  168: { bucketMinutes: 120, divisionHours: 24 },
} as const;
export type HistoryHours = keyof typeof HISTORY_WINDOWS;
export const DEFAULT_HISTORY_HOURS: HistoryHours = 8;
export function isHistoryHours(value: unknown): value is HistoryHours {
  return typeof value === "number" && Object.hasOwn(HISTORY_WINDOWS, value);
}
export type HealthPoint = { service: Service; status: HealthStatus; checkedAt: Date; responseMs: number | null; httpStatus: number | null; reason: string; expiresAt: Date };
export type HealthBucket = { from: Date; to: Date; status: DisplayHealthStatus; count: number; averageMs: number | null };
export type ServiceHistory = { service: Service; status: DisplayHealthStatus; lastCheckedAt: Date | null; responseMs: number | null; reason: string; buckets: HealthBucket[] };
export type HealthOverview = { collectedAt: Date; hours: HistoryHours; staleAfterMs: number; services: ServiceHistory[] };
