import type { PrismaClient, Prisma, SystemConfigVersion } from './generated/prisma/client.js';
import { CONFIG_DEFAULTS, validConfigSettings, validConfigQuery, validConfigUuid, type ConfigQuery, type ConfigPage, type ConfigSettings, type ConfigChange } from './config-contracts.js';
import { SYSTEM_KEY } from './seed.js';

async function lockSystem(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<{ uuid: string; activeConfigUuid: string | null }[]>`SELECT uuid, active_config_uuid AS "activeConfigUuid" FROM system WHERE key = ${SYSTEM_KEY} FOR UPDATE`;
  if (!rows[0]) throw new Error('System identity not initialized');
  return rows[0];
}
export async function listSystemConfigs(db: PrismaClient, input: ConfigQuery): Promise<ConfigPage> {
  if (!validConfigQuery(input)) throw new Error('Invalid configuration query');
  return db.$transaction(async tx => {
    const system = await tx.system.findUniqueOrThrow({ where: { key: SYSTEM_KEY }, include: { activeConfig: { select: { version: true } } } });
    const where = { systemUuid: system.uuid, ...(input.status ? { status: input.status } : {}), ...(input.search ? { name: { contains: input.search, mode: 'insensitive' as const } } : {}) };
    return { checkedAt: new Date(), activeUuid: system.activeConfigUuid, activeVersion: system.activeConfig?.version ?? null,
      total: await tx.systemConfigVersion.count({ where }),
      versions: await tx.systemConfigVersion.findMany({ where, orderBy: { version: 'desc' }, skip: (input.page - 1) * input.limit, take: input.limit }),
      workers: (await tx.systemConfigWorker.findMany({ orderBy: { heartbeatAt: 'desc' }, take: 10, include: { appliedConfig: { select: { version: true } } } })).map(({ appliedConfig, ...worker }) => ({ ...worker, appliedVersion: appliedConfig?.version ?? null })),
      activations: await tx.systemConfigActivation.findMany({ where: { systemUuid: system.uuid }, orderBy: { createdAt: 'desc' }, take: 20 }),
    };
  }, { isolationLevel: 'RepeatableRead' });
}
export async function saveSystemConfig(db: PrismaClient, settings: ConfigSettings, actorUuid: string, existing?: { uuid: string; expectedUpdatedAt: string }) {
  if (!validConfigSettings(settings) || !validConfigUuid(actorUuid) || existing && (!validConfigUuid(existing.uuid) || !Number.isFinite(Date.parse(existing.expectedUpdatedAt)))) return { status: 'invalid' as const };
  // Explicit projection prevents callers from writing status, audit, version or ownership.
  const data = { name: settings.name.trim(), description: settings.description, monitoringIntervalSeconds: settings.monitoringIntervalSeconds,
    cleanupIntervalSeconds: settings.cleanupIntervalSeconds, ocrPollSeconds: settings.ocrPollSeconds ?? CONFIG_DEFAULTS.ocrPollSeconds, historyRetentionDays: settings.historyRetentionDays, queueRetryLimit: settings.queueRetryLimit, slowResponseMs: settings.slowResponseMs, updatedByUuid: actorUuid };
  return db.$transaction(async tx => {
    const system = await lockSystem(tx);
    if (existing) {
      const changed = await tx.systemConfigVersion.updateMany({ where: { uuid: existing.uuid, systemUuid: system.uuid, status: 'DRAFT', updatedAt: new Date(existing.expectedUpdatedAt) }, data: { ...data, updatedAt: new Date(Math.max(Date.now(), Date.parse(existing.expectedUpdatedAt) + 1)) } });
      return { status: changed.count ? 'ok' as const : 'conflict' as const };
    }
    const last = await tx.systemConfigVersion.aggregate({ where: { systemUuid: system.uuid }, _max: { version: true } });
    const version = await tx.systemConfigVersion.create({ data: { ...data, systemUuid: system.uuid, version: (last._max.version ?? 0) + 1, createdByUuid: actorUuid } });
    return { status: 'ok' as const, uuid: version.uuid };
  });
}
export async function changeSystemConfig(db: PrismaClient, change: ConfigChange, actorUuid: string) {
  if (!change || !validConfigUuid(change.uuid) || !validConfigUuid(actorUuid) || !Number.isFinite(Date.parse(change.expectedUpdatedAt))
    || !['publish','activate','archive','clone'].includes(change.operation) || change.expectedActiveUuid !== null && !validConfigUuid(change.expectedActiveUuid)) return { status: 'invalid' as const };
  return db.$transaction(async tx => {
    const system = await lockSystem(tx);
    const row = await tx.systemConfigVersion.findFirst({ where: { uuid: change.uuid, systemUuid: system.uuid, updatedAt: new Date(change.expectedUpdatedAt) } });
    if (!row) return { status: 'conflict' as const };
    if (change.operation === 'clone') {
      const last = await tx.systemConfigVersion.aggregate({ where: { systemUuid: system.uuid }, _max: { version: true } });
      const copy = await tx.systemConfigVersion.create({ data: { systemUuid: system.uuid, version: (last._max.version ?? 0) + 1,
        name: row.name, description: row.description, monitoringIntervalSeconds: row.monitoringIntervalSeconds, cleanupIntervalSeconds: row.cleanupIntervalSeconds, ocrPollSeconds: row.ocrPollSeconds,
        historyRetentionDays: row.historyRetentionDays, queueRetryLimit: row.queueRetryLimit, slowResponseMs: row.slowResponseMs, createdByUuid: actorUuid, updatedByUuid: actorUuid } });
      return { status: 'ok' as const, uuid: copy.uuid };
    }
    if (change.operation === 'activate') {
      if (row.status !== 'PUBLISHED' || system.activeConfigUuid !== change.expectedActiveUuid || system.activeConfigUuid === row.uuid) return { status: 'conflict' as const };
      await tx.system.update({ where: { uuid: system.uuid }, data: { activeConfigUuid: row.uuid } });
      await tx.systemConfigActivation.create({ data: { systemUuid: system.uuid, configUuid: row.uuid, previousConfigUuid: system.activeConfigUuid, createdByUuid: actorUuid } });
    } else if (change.operation === 'publish') {
      if (row.status !== 'DRAFT' || !validConfigSettings(row)) return { status: 'conflict' as const };
      await tx.systemConfigVersion.update({ where: { uuid: row.uuid }, data: { status: 'PUBLISHED', publishedAt: new Date(), publishedByUuid: actorUuid, updatedByUuid: actorUuid, updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)) } });
    } else {
      if (row.status === 'ARCHIVED' || system.activeConfigUuid === row.uuid) return { status: 'conflict' as const };
      await tx.systemConfigVersion.update({ where: { uuid: row.uuid }, data: { status: 'ARCHIVED', archivedAt: new Date(), archivedByUuid: actorUuid, updatedByUuid: actorUuid, updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)) } });
    }
    return { status: 'ok' as const };
  });
}
export async function activeSystemConfig(db: PrismaClient): Promise<SystemConfigVersion | null> {
  return (await db.system.findUnique({ where: { key: SYSTEM_KEY }, include: { activeConfig: true } }))?.activeConfig ?? null;
}
export async function runActiveSystemConfig<T>(db: PrismaClient, configUuid: string | undefined, action: (config: SystemConfigVersion) => Promise<T>): Promise<T | { skipped: true }> {
  if (!validConfigUuid(configUuid)) return { skipped: true };
  const config = await activeSystemConfig(db);
  return config?.uuid === configUuid ? action(config) : { skipped: true };
}
/** Serialize reconciliations with activation, and acknowledge only successful external application. */
export async function reconcileSystemConfig(db: PrismaClient, workerKey: string, apply: (config: SystemConfigVersion | null) => Promise<void>) {
  await db.$transaction(async tx => {
    const system = await lockSystem(tx);
    const config = system.activeConfigUuid ? await tx.systemConfigVersion.findUniqueOrThrow({ where: { uuid: system.activeConfigUuid } }) : null;
    await apply(config);
    const previous = await tx.systemConfigWorker.findUnique({ where: { workerKey } });
    const now = new Date();
    await tx.systemConfigWorker.upsert({ where: { workerKey }, create: { workerKey, appliedConfigUuid: config?.uuid ?? null, appliedAt: config ? now : null, heartbeatAt: now },
      update: { appliedConfigUuid: config?.uuid ?? null, appliedAt: previous?.appliedConfigUuid === config?.uuid ? previous?.appliedAt : config ? now : null, heartbeatAt: now, errorCode: null } });
  }, { timeout: 20000 });
}

export async function ocrPollSeconds(db: PrismaClient) {
  const system = await db.system.findUnique({ where: { key: SYSTEM_KEY }, select: { activeConfig: { select: { ocrPollSeconds: true } } } });
  return system?.activeConfig?.ocrPollSeconds ?? CONFIG_DEFAULTS.ocrPollSeconds;
}
