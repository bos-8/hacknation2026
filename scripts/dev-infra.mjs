import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, main, readEnvironment, safePath, logStatus } from './lib/runtime.mjs';
import { composeArgs, containerName, INFRA_ROLES } from './lib/compose.mjs';

const execute = promisify(execFile);
const services = new Set([...INFRA_ROLES, 's3console']);

export function infraPlan(env, config) {
  const project = env.STACK_NAME;
  if (env.ENV_MODE !== 'dev' || !/^[a-z0-9][a-z0-9_-]*dev$/.test(project || '') || config.name !== project) {
    throw new Error('Infrastructure reset requires an isolated DEV Compose project ending in dev.');
  }
  if (Object.entries(config.services || {}).some(([name, service]) => !services.has(name) ||
      service.container_name && service.container_name !== containerName(env, name)) || !config.services?.db) {
    throw new Error('Unexpected services in DEV infrastructure configuration.');
  }
  const volumes = Object.entries(config.volumes || {}).map(([key, volume]) => {
    if (!['postgres-data', 'seaweed-data', 's3console-data'].includes(key) || volume.external ||
        !volume.name?.startsWith(project + '-') || volume.driver_opts || volume.driver && volume.driver !== 'local') {
      throw new Error('Refusing external, foreign or custom-driver DEV volumes.');
    }
    return { key, name: volume.name };
  });
  if (new Set(volumes.map(volume => volume.name)).size !== volumes.length || volumes.length !== 3) {
    throw new Error('Expected three independent DEV data volumes.');
  }
  return { project, volumes };
}

export class DevInfra {
  constructor({ root = ROOT, docker, log = logStatus } = {}) {
    this.root = root;
    this.log = log;
    this.docker = docker || (async (args, { live = false } = {}) => {
      try {
        if (live) {
          await new Promise((resolve, reject) => {
            const child = spawn('docker', args, { cwd: root, windowsHide: true,
              stdio: 'inherit', timeout: 600000 });
            child.once('error', reject);
            child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`Docker exited (${signal || code}).`)));
          });
          return '';
        }
        return (await execute('docker', args, { cwd: root, windowsHide: true,
          timeout: 600000, maxBuffer: 8 * 1024 * 1024 })).stdout;
      } catch { throw new Error('DEV infrastructure Docker operation failed; private diagnostics hidden. Inspect container health in the selected project.'); }
    });
  }

  async visible(args, label) {
    const started = Date.now();
    this.log(`[info] ${label}`);
    const heartbeat = setInterval(() => {
      this.log(`[wait] ${label} (${Math.floor((Date.now() - started) / 1000)}s elapsed; Docker is still running)`);
    }, 15000);
    heartbeat.unref();
    try { await this.docker(args, { live: true }); }
    finally { clearInterval(heartbeat); }
  }

  async context() {
    const env = await readEnvironment(this.root, 'infra/local/.env.dev');
    if (await safePath(this.root, 'infra/local/.env.qa') &&
        (await readEnvironment(this.root, 'infra/local/.env.qa')).STACK_NAME === env.STACK_NAME) {
      throw new Error('DEV and QA must use distinct Compose projects.');
    }
    const args = composeArgs(this.root, 'dev', env, ['tools']);
    const config = JSON.parse(await this.docker([...args, 'config', '--format', 'json']));
    return { args, ...infraPlan(env, config) };
  }

  async delete() {
    const plan = await this.context();
    const names = (await this.docker(['volume', 'ls', '--filter', `label=com.docker.compose.project=${plan.project}`, '--format', '{{.Name}}']))
      .trim().split(/\r?\n/).filter(Boolean);
    const allNames = (await this.docker(['volume', 'ls', '--format', '{{.Name}}'])).trim().split(/\r?\n/).filter(Boolean);
    if (names.some(name => !plan.volumes.some(volume => volume.name === name))) {
      throw new Error('Unrecognized DEV volume; refusing an incomplete or unverified reset.');
    }
    const selected = plan.volumes.filter(volume => allNames.includes(volume.name));
    for (const { name } of selected) {
      const expected = plan.volumes.find(volume => volume.name === name);
      if (!expected) throw new Error('Unrecognized DEV volume; refusing an incomplete or unverified reset.');
      const [volume] = JSON.parse(await this.docker(['volume', 'inspect', name]));
      if (volume.Labels?.['com.docker.compose.project'] !== plan.project ||
          volume.Labels?.['com.docker.compose.volume'] !== expected.key || volume.Driver !== 'local' ||
          Object.keys(volume.Options || {}).length) throw new Error('DEV volume ownership or storage driver mismatch.');
      const consumers = (await this.docker(['ps', '-aq', '--filter', `volume=${name}`])).trim().split(/\r?\n/).filter(Boolean);
      for (const id of consumers) {
        const [container] = JSON.parse(await this.docker(['inspect', id]));
        if (container.Config?.Labels?.['com.docker.compose.project'] !== plan.project) {
          throw new Error('A foreign container uses a DEV volume; deletion refused.');
        }
      }
    }
    this.log(`[clean] Permanently deleting ${plan.project} containers and volumes: ${selected.map(volume => volume.name).join(', ') || '(none)'}`);
    await this.visible([...plan.args, 'down', '--volumes', '--remove-orphans'], `Removing ${plan.project} containers and volumes.`);
    const remaining = (await this.docker(['volume', 'ls', '--filter', `label=com.docker.compose.project=${plan.project}`, '--format', '{{.Name}}'])).trim();
    if (remaining) throw new Error('Some DEV volumes remain; reset did not complete.');
    this.log('[ok] DEV containers and data volumes deleted. Env, certificates and host applications preserved.');
  }

  async up({ build = true } = {}) {
    const plan = await this.context();
    await this.visible([...plan.args, 'up', '--detach', build ? '--build' : '--no-build', '--wait', '--wait-timeout', '240', '--remove-orphans'],
      `${build ? 'Building/starting' : 'Starting'} ${plan.project} infrastructure, including the S3 console; waiting for health (limit 240s after startup).`);
    this.log('[ok] DEV infrastructure is healthy. Host applications and Prisma migrations were not started.');
  }

  async down() {
    const plan = await this.context();
    await this.visible([...plan.args, 'down', '--remove-orphans'], `Stopping ${plan.project} infrastructure; preserving volumes.`);
    this.log('[ok] DEV infrastructure stopped; all data volumes preserved.');
  }

  async status() {
    const plan = await this.context();
    this.log((await this.docker([...plan.args, 'ps', '--all'])).trim());
  }

  async logs() {
    const plan = await this.context();
    this.log((await this.docker([...plan.args, 'logs', '--tail', '100'])).trim());
  }
}

main(import.meta.url, async () => {
  const [action, ...extra] = process.argv.slice(2);
  if (extra.some(value => value !== '--no-build') || extra.length > 1 || extra.length && action !== 'up' ||
      !['delete', 'up', 'down', 'status', 'logs'].includes(action)) throw new Error('Usage: node scripts/dev-infra.mjs delete|up [--no-build]|down|status|logs');
  await new DevInfra()[action]({ build: !extra.includes('--no-build') });
});
