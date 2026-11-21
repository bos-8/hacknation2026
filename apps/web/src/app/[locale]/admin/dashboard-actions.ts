'use server';

import { withAdminSession } from '@/server/auth/admin-action';
import { readAdminDashboard } from '@/server/admin-dashboard';

export async function refreshDashboard() {
  return withAdminSession(async () => {
    try { return { status: 'ok' as const, dashboard: await readAdminDashboard() }; }
    catch { return { status: 'failed' as const }; }
  });
}
