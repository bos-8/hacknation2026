import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export { PrismaClient, Prisma, RoleCode, ProductStatus, TagStatus } from './generated/prisma/client.js';
export * from './system-config.js';
export type { User, Session, Account, Verification, System, Role, File, FileVersion, Tag, FileTag, Product } from './generated/prisma/client.js';

export interface DatabaseOptions {
  connectionString: string;
  maxConnections?: number;
}

/** Server-only factory. The process owner reuses one client and disconnects on shutdown. */
export function createDatabaseClient({ connectionString, maxConnections = 5 }: DatabaseOptions): PrismaClient {
  let valid = false;
  try {
    const url = new URL(connectionString);
    valid = ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname && url.pathname.slice(1));
  } catch { /* Do not expose connection strings in validation errors. */ }
  if (!valid) throw new Error('A valid PostgreSQL DATABASE_URL with a database name is required');
  if (!Number.isInteger(maxConnections) || maxConnections < 1 || maxConnections > 20) {
    throw new Error('Database pool size must be an integer between 1 and 20');
  }
  const adapter = new PrismaPg({
    connectionString,
    max: maxConnections,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    query_timeout: 6000,
    lock_timeout: 3000,
    idleTimeoutMillis: 30000,
  });
  return new PrismaClient({ adapter });
}
