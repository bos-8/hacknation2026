import { mkdir, writeFile, chown, rename } from 'node:fs/promises';
const env = process.env;
for (const name of ['S3_ADMIN_ACCESS_KEY', 'S3_ADMIN_SECRET_KEY', 'S3_APP_ACCESS_KEY', 'S3_APP_SECRET_KEY', 'S3_BUCKET', 'S3_AVATAR_BUCKET', 'S3_AVATAR_ACCESS_KEY', 'S3_AVATAR_SECRET_KEY']) {
  if (!env[name]) throw new Error(`Missing ${name}`);
}
if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.S3_BUCKET)) throw new Error('Invalid S3_BUCKET');
if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.S3_AVATAR_BUCKET) || env.S3_AVATAR_BUCKET === env.S3_BUCKET) throw new Error('Invalid or shared avatar bucket');
if (new Set([env.S3_ADMIN_ACCESS_KEY, env.S3_APP_ACCESS_KEY, env.S3_AVATAR_ACCESS_KEY]).size !== 3) throw new Error('S3 identities must be distinct');
if (env.S3_ADMIN_ACCESS_KEY === env.S3_APP_ACCESS_KEY) throw new Error('S3 identities must be distinct');
const credentials = (prefix) => [{ accessKey: env[`${prefix}_ACCESS_KEY`], secretKey: env[`${prefix}_SECRET_KEY`] }];
await mkdir('/config', { recursive: true });
const temporary = `/config/s3.${process.pid}.${Date.now()}.tmp`;
await writeFile(temporary, JSON.stringify({ identities: [
  { name: 'operator', credentials: credentials('S3_ADMIN'), actions: ['Admin', 'Read', 'Write', 'List', 'Tagging'] },
  { name: 'application', credentials: credentials('S3_APP'), actions: ['Read', 'Write', 'List', 'Tagging'].map(a => `${a}:${env.S3_BUCKET}`) },
  { name: 'keycloak-avatars', credentials: credentials('S3_AVATAR'), actions: ['Read', 'Write'].map(a => `${a}:${env.S3_AVATAR_BUCKET}`) },
] }), { mode: 0o600 });
await chown(temporary, 1000, 1000);
await rename(temporary, '/config/s3.json');
console.log('S3 identities configured, values hidden.');
