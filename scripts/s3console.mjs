import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, main, readEnvironment, safePath, logStatus } from './lib/runtime.mjs';
import { Qa, qaRuntimeVariables } from './qa.mjs';
import { portAvailable } from './check-ports.mjs';
import { parseComposeRows } from './check-docker.mjs';
import { composeArgs, containerName } from './lib/compose.mjs';

const exec = promisify(execFile);
export const S3CONSOLE_IMAGE = 'chrislusf/seaweedfs:4.51';
export const S3CONSOLE_QA_IMAGE = S3CONSOLE_IMAGE + '@sha256:f7a49e3f3972ebed5be2ed4befa4a0c68eb7bdddba6e692d42729ceb545134b8';
export const CONSOLE_DEFAULTS = { S3CONSOLE_IMAGE, S3CONSOLE_HOST: 'localhost', S3CONSOLE_PORT: '8090', S3CONSOLE_ADMIN_USERNAME: 'admin',
  S3CONSOLE_ADMIN_PASSWORD: 'SECRET_CHANGE_ME', S3CONSOLE_CPU_LIMIT: '0.5', S3CONSOLE_MEMORY_LIMIT: '128m' };

export function consoleEnvironment(env) {
  if (!/^[A-Za-z0-9_.@-]{1,64}$/.test(env.S3CONSOLE_ADMIN_USERNAME || '')) throw new Error('Configure S3CONSOLE_ADMIN_USERNAME.');
  const password = env.S3CONSOLE_ADMIN_PASSWORD || '';
  if (password.length < 32 || password.includes('CHANGE_ME') || /[\r\n\0]/.test(password)) throw new Error('Configure S3CONSOLE_ADMIN_PASSWORD; value hidden. Run pnpm s3console:init.');
  return { WEED_ADMIN_USER: env.S3CONSOLE_ADMIN_USERNAME, WEED_ADMIN_PASSWORD: password, TZ: env.TZ || 'Europe/Warsaw' };
}

export class S3Console {
  constructor({ root = ROOT, mode = 'dev', port, execute, available = portAvailable, log = logStatus } = {}) {
    if (!['dev', 'qa'].includes(mode)) throw new Error('S3 console mode must be dev or qa.');
    if (port !== undefined && (!/^\d+$/.test(String(port)) || Number(port) < 1024 || Number(port) > 65535)) throw new Error('S3 console port must be 1024-65535.');
    this.root = root; this.mode = mode; this.portOverride = port; this.log = log; this.available = available;
    this.file = `infra/local/.env.${mode}`;
    this.execute = execute || (async (args, env) => {
      try { return (await exec('docker', args, { cwd: root, env, timeout: 120000, maxBuffer: 2 * 1024 * 1024, windowsHide: true })).stdout; }
      catch { throw new Error('S3 console Docker operation failed; private diagnostics hidden. Check Docker and the selected stack.'); }
    });
  }

  async settings(initializing = false) {
    const env = await readEnvironment(this.root, this.file);
    if (env.ENV_MODE !== this.mode || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(env.STACK_NAME || '')
      || !/^\d+$/.test(env.INSTANCE_INDEX || '0')) throw new Error('Invalid selected S3 console project identity.');
    const other = `infra/local/.env.${this.mode === 'dev' ? 'qa' : 'dev'}`;
    if (await safePath(this.root, other)) {
      if ((await readEnvironment(this.root, other)).STACK_NAME === env.STACK_NAME) throw new Error('DEV and QA must have distinct projects.');
    }
    const port = this.portOverride ?? env.S3CONSOLE_PORT ?? CONSOLE_DEFAULTS.S3CONSOLE_PORT;
    if (!/^\d+$/.test(String(port)) || Number(port) < 1024 || Number(port) > 65535) throw new Error('S3 console port must be 1024-65535.');
    this.port = Number(port);
    this.host = env.S3CONSOLE_HOST || CONSOLE_DEFAULTS.S3CONSOLE_HOST;
    if (this.host.length > 253 || this.host !== 'localhost' && !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(this.host)) throw new Error('Invalid S3CONSOLE_HOST.');
    this.image = env.S3CONSOLE_IMAGE || (this.mode === 'qa' ? S3CONSOLE_QA_IMAGE : S3CONSOLE_IMAGE);
    const digest = /^[a-z0-9][a-zA-Z0-9._/:-]*@sha256:[a-f0-9]{64}$/.test(this.image);
    const version = /^[a-z0-9][a-zA-Z0-9._/:-]*:\d+\.\d+(?:\.\d+)?(?:[-.][a-zA-Z0-9]+)*$/.test(this.image);
    if (this.mode === 'qa' ? !digest : !digest && !version) throw new Error(this.mode === 'qa'
      ? 'QA S3 console image must be pinned by digest.' : 'DEV S3 console image requires an explicit version or digest.');
    return { env, bundle: initializing ? undefined : consoleEnvironment(env) };
  }

  async init() {
    const { env } = await this.settings(true);
    const file = await safePath(this.root, this.file);
    const text = await readFile(file, 'utf8');
    const defaultImage = this.mode === 'qa' ? S3CONSOLE_QA_IMAGE : S3CONSOLE_IMAGE;
    const selected = { ...CONSOLE_DEFAULTS, S3CONSOLE_IMAGE: defaultImage, S3CONSOLE_HOST: this.host, ...Object.fromEntries(Object.entries(env).filter(([key]) => key in CONSOLE_DEFAULTS)) };
    if (selected.S3CONSOLE_IMAGE.startsWith('cloudlena/s3manager:')) selected.S3CONSOLE_IMAGE = defaultImage;
    if (!selected.S3CONSOLE_ADMIN_PASSWORD || selected.S3CONSOLE_ADMIN_PASSWORD.includes('CHANGE_ME')) selected.S3CONSOLE_ADMIN_PASSWORD = randomBytes(32).toString('hex');
    consoleEnvironment(selected);
    const entries = Object.entries(selected).map(([key, value]) => {
      const previous = text.split(/\r?\n/).find(line => line.startsWith(key + '='));
      return previous && value === env[key] ? previous : `${key}=${value}`;
    });
    const block = '# ---[CONSOLE]'.padEnd(100, '-') + '\n' + entries.join('\n');
    const header = /^# ---\[CONSOLE\].*$/m;
    let updated = text.replace(/^S3CONSOLE_[A-Z_]+=.*\r?\n?/gm, '');
    if (header.test(updated)) updated = updated.replace(header, () => block);
    else if (/^S3_MEMORY_LIMIT=.*$/m.test(updated)) updated = updated.replace(/^S3_MEMORY_LIMIT=.*$/m, line => line + '\n' + block);
    else updated = updated.trimEnd() + '\n\n' + block + '\n';
    if (updated !== text) await writeFile(file, updated, { mode: 0o600 });
    // Delete only the obsolete generated file inside this workspace; credentials remain in the owning env.
    const legacy = await safePath(this.root, this.file + '.s3console');
    if (legacy) await rm(legacy);
    this.log(`[ok] ${this.mode.toUpperCase()} SeaweedFS Admin UI configured in STORAGE / CONSOLE; login credentials hidden.`);
  }

  async context() {
    const { env, bundle } = await this.settings();
    const runtime = { ...process.env, ...env, ...(this.mode === 'qa' ? qaRuntimeVariables(env) : {}),
      S3CONSOLE_IMAGE: this.image, S3CONSOLE_HOST: this.host, S3CONSOLE_PORT: String(this.port) };
    const args = composeArgs(this.root, this.mode, env, ['tools']);
    const config = JSON.parse(await this.execute([...args, 'config', '--format', 'json'], runtime));
    const service = config.services?.s3console;
    const port = service?.ports?.[0];
    const mount = service?.volumes?.[0];
    const volume = config.volumes?.[mount?.source];
    if (config.name !== env.STACK_NAME || service?.container_name !== containerName(env, 's3console')
      || service.image !== this.image || service.ports?.length !== 1 || port?.host_ip !== '127.0.0.1'
      || Number(port.published) !== this.port || Number(port.target) !== 8080 || port.protocol !== 'tcp'
      || service.volumes?.length !== 1 || mount?.type !== 'volume' || mount.target !== '/data' || mount.read_only === true
      || volume?.external || volume?.name !== (env.S3CONSOLE_VOLUME_NAME || `${env.STACK_NAME}-s3console`)
      || service.privileged || service.read_only !== true || service.user !== '1000:1000'
      || JSON.stringify(service.entrypoint) !== JSON.stringify(['/usr/bin/weed'])
      || JSON.stringify(service.command) !== JSON.stringify(['admin', '-master=s3:9333', '-ip=0.0.0.0', '-port=8080', '-port.legacy=0', '-dataDir=/data/admin', '-iceberg.port=0', '-lance.port=0'])) throw new Error('Unsafe S3 console Compose configuration.');
    if (Object.keys(service.environment || {}).length !== Object.keys(bundle).length
      || Object.entries(bundle).some(([key, value]) => service.environment[key] !== value)) throw new Error('Unexpected S3 console runtime credentials or settings.');
    return { env, runtime, args };
  }

  async engine() {
    await new Qa({ root: this.root, execute: this.execute }).engine();
  }

  async build() {
    await this.settings();
    await this.engine();
    await this.execute(['pull', this.image], process.env);
    this.log('[ok] Configured S3 console image available.');
  }

  async start() {
    await this.engine();
    const context = await this.context();
    const rows = parseComposeRows(await this.execute([...context.args, 'ps', '--all', '--format', 'json'], context.runtime));
    const owner = rows.find(row => row.Project === context.env.STACK_NAME && row.Service === 's3console' && row.State === 'running'
      && row.Publishers?.some(port => port.Protocol === 'tcp' && Number(port.PublishedPort) === this.port));
    if (!await this.available(this.port) && !owner) throw new Error(`ERROR S3CONSOLE PORT IS OCCUPIED: ${this.port}. No services were stopped.`);
    if (!rows.some(row => row.Project === context.env.STACK_NAME && row.Service === 's3' && row.State === 'running' && row.Health === 'healthy')) {
      throw new Error('Selected SeaweedFS must already be running and healthy. Start the owning DEV or QA stack first.');
    }
    try { await this.execute(['image', 'inspect', '--format', '{{.Id}}', this.image], process.env); }
    catch { throw new Error('Missing console image. Run pnpm s3console:build.'); }
    await this.execute([...context.args, 'up', '--detach', '--no-deps', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '90', 's3console'], context.runtime);
    this.log(`[ok] SeaweedFS Admin UI: http://localhost:${this.port}/login`);
  }

  async manage(action) {
    await this.engine();
    const context = await this.context();
    const command = { stop: ['stop', '--timeout', '15', 's3console'], status: ['ps', '--all', 's3console'], logs: ['logs', '--tail', '50', 's3console'] }[action];
    if (!command) throw new Error('Unknown console operation.');
    const output = await this.execute([...context.args, ...command], context.runtime);
    // Logs are operator-only and may contain object names; never print the resolved Compose model.
    if (output.trim()) this.log(output.trim());
  }
}

main(import.meta.url, async () => {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { mode: { type: 'string', default: 'dev' }, port: { type: 'string' } } });
  const console = new S3Console({ mode: values.mode, port: values.port });
  const [action] = positionals;
  if (action === 'up') { await console.init(); await console.build(); await console.start(); }
  else if (['init', 'build', 'start'].includes(action)) await console[action]();
  else if (['stop', 'status', 'logs'].includes(action)) await console.manage(action);
  else throw new Error('Usage: node scripts/s3console.mjs init|build|start|up|stop|status|logs [--mode dev|qa] [--port 8090]');
});
