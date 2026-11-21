import 'server-only';
import { readHealth } from '@formiq/monitoring';
import { withDeadline } from '../../../../packages/monitoring/src/deadline.ts';
import { getDatabase } from './database.ts';
import { getJobQueue } from './queue.ts';
import { fileStore, getFilesConfig } from './files.ts';
import { getIdentityDirectory } from './auth/directory.ts';
import type { ApplicationSummary, DashboardData } from '../schemas/admin-dashboard.ts';

async function applicationSummary(): Promise<ApplicationSummary> {
  const db = getDatabase();
  const [products, activeProducts, files, versions, tags, users, sessions] = await db.$transaction([
    db.product.count(), db.product.count({ where: { status: 'active' } }), db.file.count(), db.fileVersion.count(),
    db.tag.count(), db.user.count(), db.session.count({ where: { expiresAt: { gt: new Date() } } }),
  ], { isolationLevel: 'RepeatableRead' });
  return { products, activeProducts, files, versions, tags, users, sessions };
}

/** Independent failures preserve the other counters. Call only after administrator authorization. */
export async function readAdminDashboard(): Promise<DashboardData> {
  const read = async <T>(operation: () => Promise<T>): Promise<T | null> => {
    try { return await withDeadline(operation); } catch { return null; }
  };
  const [overview, application, storage, identity, queue] = await Promise.all([
    read(() => readHealth(getDatabase())), read(applicationSummary),
    read(async () => {
      const store = fileStore(getFilesConfig());
      try { return await store.summary(); } finally { store.close(); }
    }),
    read(async () => await getIdentityDirectory().userCounts?.() ?? null),
    read(() => getJobQueue().summary()),
  ]);
  return { collectedAt: new Date().toISOString(), overview, application, storage, identity, queue };
}
