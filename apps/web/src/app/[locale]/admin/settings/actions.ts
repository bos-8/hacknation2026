"use server";
import { changeSystemConfig, listSystemConfigs, saveSystemConfig } from '@formiq/database';
import { validConfigSettings, validConfigUuid, type ConfigSettings, type ConfigQuery, type ConfigChange } from '@formiq/database/config';
import { getDatabase } from '@/server/database';
import { withAdminSession } from '@/server/auth/admin-action';
import { configQuerySchema } from '@/schemas/system-config';

export async function refreshSettings(query: ConfigQuery) {
  return withAdminSession(async () => {
    const parsed = configQuerySchema.safeParse(query);
    if (!parsed.success) return { status: 'failed' as const };
    try { return { status: 'ok' as const, page: await listSystemConfigs(getDatabase(), parsed.data) }; }
    catch { return { status: 'failed' as const }; }
  });
}
export async function submitSettings(settings: ConfigSettings, existing?: {uuid:string;expectedUpdatedAt:string}) {
  return withAdminSession(async actor => {
    if (!validConfigSettings(settings) || existing && (!validConfigUuid(existing.uuid) || !Number.isFinite(Date.parse(existing.expectedUpdatedAt)))) return {status:'invalid' as const};
    try { return await saveSystemConfig(getDatabase(), settings, actor, existing); }
    catch { return {status:'failed' as const}; }
  });
}
export async function transitionSettings(change: ConfigChange) {
  return withAdminSession(async actor => {
    try { return await changeSystemConfig(getDatabase(), change, actor); }
    catch { return {status:'failed' as const}; }
  });
}
