import type { SystemConfigVersion, SystemConfigWorker, SystemConfigActivation } from './generated/prisma/client.js';
export type ConfigVersion = SystemConfigVersion;
export type ConfigSettings = Pick<ConfigVersion, 'name' | 'description' | 'monitoringIntervalSeconds' | 'cleanupIntervalSeconds' | 'ocrPollSeconds' | 'historyRetentionDays' | 'queueRetryLimit' | 'slowResponseMs'>;
export const CONFIG_INTERVALS = [60, 120, 180, 240, 300, 600, 900, 1200, 1800, 3600] as const;
export const CONFIG_DEFAULTS: ConfigSettings = { name: 'Default', description: '', monitoringIntervalSeconds: 60, cleanupIntervalSeconds: 60, ocrPollSeconds: 10, historyRetentionDays: 7, queueRetryLimit: 3, slowResponseMs: 1500 };
export type ConfigQuery = { page: number; limit: number; search: string; status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' };
export type ConfigPage = { checkedAt: Date; versions: ConfigVersion[]; total: number; activeUuid: string | null; activeVersion: number | null; workers: (SystemConfigWorker & { appliedVersion: number | null })[]; activations: SystemConfigActivation[] };
export function validConfigSettings(value: unknown): value is ConfigSettings {
  if (!value || typeof value !== 'object') return false;
  const v = value as ConfigSettings;
  return typeof v.name === 'string' && v.name.trim().length > 0 && v.name.length <= 120 && typeof v.description === 'string' && v.description.length <= 2000
    && CONFIG_INTERVALS.some(n => n === v.monitoringIntervalSeconds) && CONFIG_INTERVALS.some(n => n === v.cleanupIntervalSeconds)
    && (v.ocrPollSeconds === undefined || Number.isInteger(v.ocrPollSeconds) && v.ocrPollSeconds >= 1 && v.ocrPollSeconds <= 3600)
    && Number.isInteger(v.historyRetentionDays) && v.historyRetentionDays >= 1 && v.historyRetentionDays <= 7
    && Number.isInteger(v.queueRetryLimit) && v.queueRetryLimit >= 0 && v.queueRetryLimit <= 10
    && Number.isInteger(v.slowResponseMs) && v.slowResponseMs >= 100 && v.slowResponseMs <= 5000;
}
export function validConfigQuery(v: ConfigQuery) {
  return Number.isInteger(v.page) && v.page >= 1 && v.page <= 40001 && [10,25,50].includes(v.limit)
    && typeof v.search === 'string' && v.search.length <= 200 && (!v.status || ['DRAFT','PUBLISHED','ARCHIVED'].includes(v.status));
}
export type ConfigChange = { uuid: string; expectedUpdatedAt: string; operation: 'publish' | 'activate' | 'archive' | 'clone'; expectedActiveUuid: string | null };
export const validConfigUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
