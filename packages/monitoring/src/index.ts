import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { PrismaClient } from "@formiq/database";
import { SERVICES, STALE_AFTER_MS, HISTORY_WINDOWS, DEFAULT_HISTORY_HOURS, isHistoryHours, type HistoryHours, type HealthPoint, type HealthStatus, type HealthOverview, type Service } from "./contracts.js";
export * from "./contracts.js";
import { withDeadline } from './deadline.js';
export { withDeadline } from './deadline.js';

const TIMEOUT = 5000;
type Environment = Record<string, string | undefined>;
type ProbeResult = { status: HealthStatus; reason: string; httpStatus?: number };
function url(value: string) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Invalid health URL");
  return parsed;
}
async function http(value: string, json: boolean): Promise<ProbeResult> {
  const response = await fetch(url(value), { signal: AbortSignal.timeout(TIMEOUT), redirect: "manual", cache: "no-store" });
  try {
    if (response.status !== 200) return { status: "error", reason: "http_error", httpStatus: response.status };
    if (json) {
      const reader = response.body?.getReader();
      if (!reader) return { status: "error", reason: "invalid_response" };
      let text = "", size = 0;
      try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 65536) throw new Error("Oversize response"); text += new TextDecoder().decode(part.value); } }
      finally { await reader.cancel(); reader.releaseLock(); }
      const body = JSON.parse(text);
      if (!body || typeof body !== "object" || (body.status !== "ok" && body.status !== "healthy" && typeof body.issuer !== "string")) return { status: "error", reason: "invalid_response" };
    } else if (!response.headers.get("content-type")?.includes("text/html")) return { status: "error", reason: "invalid_response" };
    return { status: "healthy", reason: "ok", httpStatus: 200 };
  } finally { await response.body?.cancel().catch(() => {}); }
}

export async function collectHealth(db: PrismaClient, env: Environment, queueHealthy: () => Promise<boolean>, now = new Date(), retentionDays = 7) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 7) throw new Error("Invalid health retention");
  const origin = env.AUTH_BASE_URL;
  const slow = Number(env.MONITORING_SLOW_MS || 1500);
  if (!Number.isFinite(slow) || slow < 100 || slow > TIMEOUT) throw new Error("Invalid monitoring threshold");
  const probe = async (service: Service): Promise<ProbeResult> => {
    switch (service) {
      case "web": return origin ? http(new URL("/pl", url(origin)).href, false) : { status: "unconfigured", reason: "not_configured" };
      case "backend": return origin ? http(new URL("/api/v1/health/ready", url(origin)).href, true) : { status: "unconfigured", reason: "not_configured" };
      case "keycloak": return env.AUTH_ISSUER ? http(`${env.AUTH_ISSUER.replace(/\/$/, "")}/.well-known/openid-configuration`, true) : { status: "unconfigured", reason: "not_configured" };
      case "pyworker": return env.MONITOR_PYWORKER_URL ? http(env.MONITOR_PYWORKER_URL, true) : { status: "unconfigured", reason: "not_configured" };
      case "database": await db.$queryRaw`SELECT 1`; return { status: "healthy", reason: "ok" };
      case "queue_worker": return await queueHealthy() ? { status: "healthy", reason: "ok" } : { status: "degraded", reason: "worker_missing" };
      case "storage": {
        if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_APP_ACCESS_KEY || !env.S3_APP_SECRET_KEY) return { status: "unconfigured", reason: "not_configured" };
        const client = new S3Client({ endpoint: url(env.S3_ENDPOINT).href, region: env.S3_REGION || "eu-central-1", forcePathStyle: true,
          maxAttempts: 1, credentials: { accessKeyId: env.S3_APP_ACCESS_KEY, secretAccessKey: env.S3_APP_SECRET_KEY } });
        try { await client.send(new ListObjectsV2Command({ Bucket: env.S3_BUCKET, MaxKeys: 1 }), { abortSignal: AbortSignal.timeout(TIMEOUT) }); }
        finally { client.destroy(); }
        return { status: "healthy", reason: "ok" };
      }
    }
  };
  const checkedAt = new Date(Math.floor(now.getTime() / 60000) * 60000);
  const data = await Promise.all(SERVICES.map(async service => {
    const start = performance.now();
    let result: ProbeResult;
    try { result = await withDeadline(() => probe(service)); }
    catch { result = { status: "error", reason: "unreachable" }; }
    const responseMs = result.status === "unconfigured" ? null : Math.round(performance.now() - start);
    if (result.status === "healthy" && responseMs !== null && responseMs > slow) result = { ...result, status: "degraded", reason: "slow" };
    return { service, ...result, responseMs, checkedAt, expiresAt: new Date(checkedAt.getTime() + retentionDays * 86400000) };
  }));
  await withDeadline(() => db.serviceHealthSample.createMany({ data, skipDuplicates: true }));
  return { sampled: data.length };
}

export async function cleanupHealth(db: PrismaClient, now = new Date(), retentionDays = 7): Promise<{ count: number }> {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 7) throw new Error("Invalid health retention");
  return db.serviceHealthSample.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { checkedAt: { lte: new Date(now.getTime() - retentionDays * 86400000) } }] } });
}

type Group = { service: Service; slot: number; status: HealthStatus; count: number; averageMs: number | null };
export async function readHealth(db: PrismaClient, now = new Date(), hours: HistoryHours = DEFAULT_HISTORY_HOURS): Promise<HealthOverview> {
  if (!isHistoryHours(hours)) throw new Error("Invalid history window");
  const bucketMs = HISTORY_WINDOWS[hours].bucketMinutes * 60000;
  const bucketCount = hours * 3600000 / bucketMs;
  const start = new Date(now.getTime() - hours * 3600000);
  const [groups, latest, system] = await withDeadline(() => db.$transaction([
    db.$queryRaw<Group[]>`SELECT service, LEAST(${bucketCount - 1}, floor(extract(epoch FROM (checked_at - ${start}::timestamptz)) * 1000 / ${bucketMs}))::int AS slot,
      CASE WHEN bool_or(status = 'error') THEN 'error' WHEN bool_or(status = 'degraded') THEN 'degraded'
      WHEN bool_or(status = 'healthy') THEN 'healthy' ELSE 'unconfigured' END AS status,
      count(*)::int AS count, round(avg(response_ms))::int AS "averageMs"
      FROM service_health_sample WHERE checked_at > ${start} AND checked_at <= ${now} AND expires_at > ${now} GROUP BY service, slot`,
    db.$queryRaw<HealthPoint[]>`SELECT DISTINCT ON (service) service, status, checked_at AS "checkedAt", response_ms AS "responseMs", reason
      FROM service_health_sample WHERE checked_at > ${start} AND checked_at <= ${now} AND expires_at > ${now} ORDER BY service, checked_at DESC`,
    db.system.findUnique({ where: { key: 'formiq' }, select: { activeConfig: { select: { monitoringIntervalSeconds: true } } } }),
  ], { isolationLevel: "RepeatableRead" }));
  const staleAfterMs = Math.max(STALE_AFTER_MS, (system?.activeConfig?.monitoringIntervalSeconds ?? 60) * 3000);
  return { collectedAt: now, hours, staleAfterMs, services: SERVICES.map(service => {
    const point = latest.find(row => row.service === service);
    const stale = !point || now.getTime() - point.checkedAt.getTime() > staleAfterMs;
    return { service, status: stale ? "unknown" : point.status, reason: stale ? "stale" : point.reason,
      lastCheckedAt: point?.checkedAt ?? null, responseMs: point?.responseMs ?? null,
      buckets: Array.from({ length: bucketCount }, (_, slot) => {
        const group = groups.find(row => row.service === service && row.slot === slot);
        return { from: new Date(start.getTime() + slot * bucketMs), to: new Date(start.getTime() + (slot + 1) * bucketMs),
          status: group?.status ?? "unknown", count: group?.count ?? 0, averageMs: group?.averageMs ?? null };
      }) };
  }) };
}
