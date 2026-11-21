import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

// CLI only. Existing process variables take precedence over this package's DEV file.
try {
  loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url)));
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'pnpm run db:seed:execute' },
  // Generation/validation are offline operations; DB commands require DATABASE_URL.
  ...(process.env.DATABASE_URL ? {
    datasource: {
      url: process.env.DATABASE_URL,
      ...(process.env.SHADOW_DATABASE_URL ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } : {}),
    },
  } : {}),
});
