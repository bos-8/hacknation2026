import { ROOT, main, readEnvironment, logStatus } from './lib/runtime.mjs';

export function checkAuthSecret(values) {
  if (typeof values.AUTH_SECRET !== 'string' || values.AUTH_SECRET.length < 32 || !values.AUTH_SECRET.trim()) {
    throw new Error('Invalid DEV auth configuration: AUTH_SECRET must contain at least 32 characters. Update apps/web/.env; value hidden.');
  }
}

main(import.meta.url, async () => {
  const values = { ...await readEnvironment(ROOT, 'apps/web/.env'), ...process.env };
  checkAuthSecret(values);
  const { getAuthConfig } = await import('../apps/web/src/server/auth/config.ts');
  getAuthConfig(values);
  logStatus('[ok] DEV auth configuration is valid. Credentials and provider connectivity were not checked.');
});
