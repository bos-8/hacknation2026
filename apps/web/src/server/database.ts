import "server-only";
import { createDatabaseClient, type PrismaClient } from "@formiq/database";

// Bump with generated schema changes that invalidate the DEV HMR singleton.
const schemaVersion = "form-processing-v17";
const databaseGlobal = globalThis as typeof globalThis & { formiqDatabase?: PrismaClient; formiqDatabaseSchema?: string };
let database: PrismaClient | undefined;

/** Lazy initialization keeps builds and non-database routes independent of PostgreSQL. */
export function getDatabase(): PrismaClient {
  if (database) return database;
  if (process.env.NODE_ENV !== "production" && databaseGlobal.formiqDatabase) {
    const cached = databaseGlobal.formiqDatabase;
    if (cached.product && databaseGlobal.formiqDatabaseSchema === schemaVersion) {
      database = cached;
      return database;
    }
    databaseGlobal.formiqDatabase = undefined;
    void cached.$disconnect().catch(() => console.error("Could not close outdated DEV database client"));
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for database access");
  database = createDatabaseClient({ connectionString });
  if (process.env.NODE_ENV !== "production") {
    databaseGlobal.formiqDatabase = database;
    databaseGlobal.formiqDatabaseSchema = schemaVersion;
  }
  return database;
}
