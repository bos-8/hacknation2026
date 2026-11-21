import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseArgs, parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT, main, logStatus } from './lib/runtime.mjs';
import { synchronizePreferenceAssets } from './sync-preference-assets.mjs';
import { Qa } from './qa.mjs';
import { composeArgs } from './lib/compose.mjs';
import { DevInfra } from './dev-infra.mjs';

export async function initializeEnvironment(directory, mode) {
  if (!['dev', 'qa'].includes(mode)) throw new Error('Mode must be dev or qa');
  const file = path.join(directory, `.env.${mode}`);
  const template = await readFile(`${file}.example`, 'utf8');
  const content = template
    .replace(/^(# File:\s+.*?)\.example$/gm, '$1')
    .replace(/^(# ===\[EOF @file:.*?)\.example(\].*)$/gm, '$1$2')
    .replace(/^([A-Z0-9_]+)=(?:SECRET_CHANGE_ME|CHANGE_ME)([ \t]*(?:#.*)?)$/gm, (_, name, comment) => `${name}=${randomBytes(32).toString('hex')}${comment}`);
  try { await writeFile(file, content, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return false;
  }
  return true;
}

main(import.meta.url, async () => {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    mode: { type: 'string', default: 'dev' }, help: { type: 'boolean' }, 'no-build': { type: 'boolean' },
  } });
  const action = positionals[0] ?? 'help';
  if (values.help || action === 'help') {
    console.log('Usage: pnpm stack:<init|up|down|ps|logs|config|pull|auth:sync> [--mode dev|qa]\nDEV runs infrastructure only. QA adds release Web and workers; use qa:up for ordered startup. down preserves volumes.');
    return;
  }
  if (!['dev', 'qa'].includes(values.mode)) throw new Error('Mode must be dev or qa');
  if (values.mode === 'dev' && ['up', 'down', 'ps', 'logs'].includes(action)) {
    const infra = new DevInfra();
    await infra[{ ps: 'status' }[action] || action]({ build: !values['no-build'] });
    return;
  }
  const file = path.join(ROOT, 'infra/local', `.env.${values.mode}`);
  if (action === 'init') {
    const created = await initializeEnvironment(path.dirname(file), values.mode);
    logStatus(created ? `[ok] Created infra/local/.env.${values.mode}, random credentials hidden.`
      : `[skip] infra/local/.env.${values.mode} already exists, values preserved.`);
    return;
  }
  if (values.mode === 'qa' && action === 'up') {
    throw new Error('Use pnpm qa:up or separate qa:build, qa:deploy and qa:start. QA startup does not implicitly build images.');
  }
  const commands = {
    up: ['up', '--detach', values['no-build'] ? '--no-build' : '--build', '--wait', '--wait-timeout', '240', '--remove-orphans'],
    down: ['down'], ps: ['ps'], logs: ['logs', '--tail', '100'],
    config: ['config', '--quiet'], pull: ['pull', '--ignore-buildable'],
    'auth:sync': ['exec', '-T', 'auth', 'node', '/opt/formiq/bootstrap/configure.mjs'],
  };
  if (!Object.hasOwn(commands, action)) throw new Error('Unknown stack action');
  const env = parseEnv(await readFile(file, 'utf8'));
  if (Object.values(env).some(value => ['SECRET_CHANGE_ME', 'CHANGE_ME'].includes(value))) throw new Error('Replace placeholder credentials or generate a new environment with stack:init');
  if (env.ENV_MODE && env.ENV_MODE !== values.mode) throw new Error('ENV_MODE does not match the selected stack mode');
  if (action === 'up') {
    await synchronizePreferenceAssets();
    const certs = path.resolve(path.dirname(file), env.CERTS_DIR || './certs');
    await access(path.join(certs, env.TLS_CERT_PEM || 'localhost.pem'));
    await access(path.join(certs, env.TLS_CERT_KEY || 'localhost-key.pem'));
  }
  let base = composeArgs(ROOT, values.mode, env);
  let runtime = process.env;
  if (values.mode === 'qa') {
    const context = await new Qa().context();
    base = context.args;
    runtime = context.runtime;
  }
  async function docker(command) {
    const code = await new Promise((resolve, reject) => {
      const child = spawn('docker', [...base, ...command], { cwd: ROOT, env: runtime, stdio: 'inherit', windowsHide: true });
      child.on('error', reject);
      child.on('exit', exitCode => resolve(exitCode ?? 1));
    });
    if (code !== 0) throw new Error(`Docker Compose ${action} failed (exit ${code}). No containers from other projects were stopped.`);
  }
  await docker(commands[action]);
});
