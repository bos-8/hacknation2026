import { execFile, spawn } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { ROOT, main, safePath, parseEnvironment, logStatus } from './lib/runtime.mjs';
import { portAvailable } from './check-ports.mjs';
import { parseComposeRows } from './check-docker.mjs';
import { validateCertificates } from './validate-certs.mjs';
import { composeArgs, containerName, INFRA_ROLES, serviceRole } from './lib/compose.mjs';

const exec = promisify(execFile);
const INFRA = INFRA_ROLES;
const APPS = ['web', 'pyworker', 'queue'];
const BUILD_SERVICES = [...INFRA, ...APPS, 'maintenance'];
const SECRET = /(?:PASSWORD|SECRET|TOKEN|ACCESS_KEY)$/;
const OPENAI_VARIABLES = ['OPENAI_API_KEY', 'OPENAI_MODEL_INSTANT', 'OPENAI_MODEL_THINKING'];
const LEGACY_SUFFIXES = ['web', 'queue', 'pyworker', 'maintenance', 'nginx.template'];
// Upgrade only the former shared local endpoints. Explicit custom URLs are retained.
export function migrateQaHosts(values) {
  const env = { ...values };
  for (const key of Object.keys(env)) {
    if (key.startsWith('PROXY_') || key.startsWith('AUTH_PROXY_') || ['WEB_UPSTREAM', 'S3_MAX_BODY_SIZE'].includes(key)) delete env[key];
  }
  for (const [key, port] of [['APP_PUBLIC_URL', env.WEB_HTTPS_PORT], ['AUTH_PUBLIC_URL', env.AUTH_LOCAL_PORT], ['AUTH_ADMIN_PUBLIC_URL', env.AUTH_LOCAL_PORT]]) {
    if (port && /^https:\/\/(?:[\w-]+\.)?modulon\.local(?::\d+)?\/?$/.test(env[key] || '')) env[key] = `https://localhost:${port}`;
  }
  for (const key of ['APP_HOST','WEB_HOST','AUTH_HOST','AUTH_ADMIN_HOST','S3_HOST','S3CONSOLE_HOST']) {
    if (/(^|\.)modulon\.local$/.test(env[key] || '')) env[key] = 'localhost';
  }
  return env;
}

async function readEnv(root, file, optional = false) {
  const target = await safePath(root, file);
  if (!target && optional) return {};
  if (!target) throw new Error(`Missing ${file}. Run pnpm qa:init.`);
  return parseEnvironment(await readFile(target, 'utf8'), file);
}

function renderEnvironment(template, values) {
  const rendered = new Set();
  let content = template.replace(/^([A-Z][A-Z0-9_]*)=(.*)$/gm, (_, key, previous) => {
    rendered.add(key);
    const comment = previous.match(/\s+#.*$/)?.[0] || '';
    return `${key}=${JSON.stringify(String(values[key]))}${comment}`;
  }).replace(/^# @file: (.*)\.example$/m, '# @file: $1');
  const extra = Object.entries(values).filter(([key]) => !rendered.has(key));
  if (extra.length) content += '\n# ---[LOCAL OVERRIDES]'.padEnd(101, '-') + '\n' + extra.map(([key, value]) => `${key}=${JSON.stringify(String(value))}`).join('\n') + '\n';
  return content;
}

export function validateQaIdentity(env, dev = {}) {
  if (env.ENV_MODE !== 'qa' || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(env.STACK_NAME || '')
    || env.STACK_NAME === (dev.STACK_NAME || 'formiqdev')) throw new Error('QA requires its own ENV_MODE=qa project; DEV is protected.');
  if (!/^\d+$/.test(env.INSTANCE_INDEX || '0')) throw new Error('Invalid QA instance index');
}

export function runtimeEnvironments(env) {
  const connection = (database, user, password, schema = false) => {
    const url = new URL('postgresql://db:5432');
    url.username = user; url.password = password; url.pathname = '/' + database;
    if (schema) url.searchParams.set('schema', 'public');
    return url.href;
  };
  const databases = {
    DATABASE_URL: connection(env.DB_APP_DATABASE_NAME, env.DB_APP_USERNAME, env.DB_APP_PASSWORD, true),
    QUEUE_DATABASE_URL: connection(env.DB_QUEUE_DATABASE_NAME, env.DB_QUEUE_USERNAME, env.DB_QUEUE_PASSWORD),
  };
  const publicConfig = {
    NODE_ENV: 'production', TZ: env.TZ, NODE_OPTIONS: '--import=/app/scripts/qa-localhost.mjs', NODE_EXTRA_CA_CERTS: '/run/certs/rootCA.pem',
    AUTH_BASE_URL: env.APP_PUBLIC_URL, AUTH_ISSUER: `${env.AUTH_PUBLIC_URL}/realms/FORMIQ`,
  };
  const storage = { S3_ENDPOINT: 'http://s3:8333', S3_REGION: env.S3_REGION, S3_BUCKET: env.S3_BUCKET,
    S3_APP_ACCESS_KEY: env.S3_APP_ACCESS_KEY, S3_APP_SECRET_KEY: env.S3_APP_SECRET_KEY };
  return {
    web: { ...databases, ...publicConfig, ...storage, HOSTNAME: '0.0.0.0', PORT: env.WEB_HTTPS_PORT, APP_NAME: env.WEB_APP_NAME,
      LANGUAGE_COOKIE_NAME: env.WEB_LANGUAGE_COOKIE_NAME, THEME_COOKIE_NAME: env.WEB_THEME_COOKIE_NAME,
      CONTRAST_COOKIE_NAME: env.WEB_CONTRAST_COOKIE_NAME, UI_PREFERENCE_COOKIE_DOMAIN: env.UI_PREFERENCE_COOKIE_DOMAIN,
      AUTH_SECRET: env.AUTH_SECRET, AUTH_COOKIE_PREFIX: env.AUTH_COOKIE_PREFIX,
      ...Object.fromEntries(OPENAI_VARIABLES.map(key => [key, env[key] ?? ''])),
      AUTH_CLIENT_ID: 'formiq-web', AUTH_CLIENT_SECRET: env.KEYCLOAK_WEB_CLIENT_SECRET,
      AUTH_DIRECTORY_URL: `${env.AUTH_ADMIN_PUBLIC_URL}/admin/realms/FORMIQ`, AUTH_DIRECTORY_CLIENT_ID: 'formiq-directory',
      AUTH_DIRECTORY_CLIENT_SECRET: env.AUTH_DIRECTORY_CLIENT_SECRET,
      SESSION_TTL: env.SESSION_TTL, SESSION_WARNING: env.SESSION_WARNING,
      SESSION_AUTO_REFRESH: env.SESSION_AUTO_REFRESH, SESSION_MAX_REFRESHES: env.SESSION_MAX_REFRESHES,
      S3_AVATAR_ENDPOINT: 'http://s3:8333', S3_AVATAR_REGION: env.S3_REGION, S3_AVATAR_BUCKET: env.S3_AVATAR_BUCKET,
      S3_AVATAR_ACCESS_KEY: env.S3_AVATAR_ACCESS_KEY, S3_AVATAR_SECRET_KEY: env.S3_AVATAR_SECRET_KEY },
    queue: { ...databases, ...publicConfig, ...storage, PYWORKER_URL: 'http://pyworker:8010',
      PYWORKER_API_TOKEN: env.PYWORKER_API_TOKEN, PYWORKER_ALLOW_PRIVATE_NETWORK: 'true', PYWORKER_PROGRESS_NETWORK: 'private',
      MONITOR_PYWORKER_URL: 'http://pyworker:8010/health/ready', QUEUE_HEALTH_FILE: '/tmp/queue-ready.json' },
    pyworker: { PYWORKER_API_TOKEN: env.PYWORKER_API_TOKEN, PYWORKER_HOST: '0.0.0.0', PYWORKER_PROGRESS_NETWORK: 'private',
      PYWORKER_ALLOW_NETWORK_BIND: 'true', PYWORKER_PORT: '8010', PYWORKER_MAX_CONCURRENCY: env.PYWORKER_MAX_CONCURRENCY || '4',
      PYWORKER_TASK_TIMEOUT_SECONDS: env.PYWORKER_TASK_TIMEOUT_SECONDS || '5', PYWORKER_LOG_LEVEL: env.PYWORKER_LOG_LEVEL || 'info' },
    maintenance: databases,
  };
}

// Compose receives derived URLs through the child environment, never extra files or CLI arguments.
export function qaRuntimeVariables(env) {
  const { maintenance } = runtimeEnvironments(env);
  return { QA_DATABASE_URL: maintenance.DATABASE_URL, QA_QUEUE_DATABASE_URL: maintenance.QUEUE_DATABASE_URL };
}

export function qaPortConflicts(config, rows, available) {
  const ownPorts = new Set(rows.filter(row => row.Project === config.name && row.State === 'running')
    .flatMap(row => row.Publishers || []).filter(publisher => publisher.Protocol === 'tcp').map(publisher => Number(publisher.PublishedPort)));
  return Object.values(config.services).flatMap(service => service.ports || []).map(port => Number(port.published))
    .filter((port, index, all) => all.indexOf(port) === index && !available.get(port) && !ownPorts.has(port));
}

export class Qa {
  constructor({ root = ROOT, file = 'infra/local/.env.qa', execute, stream, available = portAvailable, log = logStatus } = {}) {
    this.root = root; this.file = file; this.available = available; this.log = log;
    this.execute = execute || (async (args, env) => {
      try { return (await exec('docker', args, { cwd: root, env, timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })).stdout; }
      catch { throw new Error('Docker operation failed; private diagnostics hidden.'); }
    });
    this.stream = stream || (async (args, env) => {
      const code = await new Promise((resolve, reject) => {
        const child = spawn('docker', args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
        const stop = () => child.kill('SIGTERM');
        process.once('SIGINT', stop); process.once('SIGTERM', stop);
        const cleanup = () => { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); };
        child.once('error', () => { cleanup(); reject(new Error('Docker could not start')); });
        child.once('exit', code => { cleanup(); resolve(code ?? 1); });
      });
      if (code !== 0) throw new Error(`QA Docker operation failed (exit ${code}).`);
    });
  }

  async settings(required = true) {
    const defaults = await readEnv(this.root, 'infra/local/.env.qa.example');
    const local = await readEnv(this.root, this.file, !required);
    const env = { ...defaults, ...local };
    const dev = await readEnv(this.root, 'infra/local/.env.dev', true);
    validateQaIdentity(env, dev);
    return { env, defaults, local };
  }

  async init() {
    const { env: existing, local } = await this.settings(false);
    const env = migrateQaHosts(existing);
    for (const [key, value] of Object.entries(env)) {
      if (SECRET.test(key) && ['CHANGE_ME', 'SECRET_CHANGE_ME'].includes(value)) env[key] = randomBytes(32).toString('hex');
    }
    // Migrate the old shared default image tags to QA-only tags, preserving custom tags.
    if (local.AUTH_IMAGE === 'modulon-poc-keycloak:26.7.5-postgres') env.AUTH_IMAGE = 'formiq-keycloak:26.7.5-postgres-qa';
    if (local.S3_IMAGE === 'modulon-poc-seaweedfs:4.51') env.S3_IMAGE = 'formiq-seaweedfs:4.51-qa';
    await safePath(this.root, this.file);
    const template = await readFile(path.join(this.root, 'infra/local/.env.qa.example'), 'utf8');
    await writeFile(path.resolve(this.root, this.file), renderEnvironment(template, env), { mode: 0o600 });
    for (const suffix of LEGACY_SUFFIXES) {
      const obsolete = await safePath(this.root, this.file + '.' + suffix);
      if (obsolete) await rm(obsolete);
    }
    this.log('[ok] Single private QA env ready; existing credentials preserved and obsolete generated files removed.');
  }

  async engine() {
    try {
      const version = JSON.parse(await this.execute(['info', '--format', '{{json .ServerVersion}}'], process.env));
      if (typeof version !== 'string' || !version) throw new Error();
      const endpoint = process.env.DOCKER_HOST || (await this.execute(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], process.env)).trim();
      if (!endpoint.startsWith('npipe://') && !endpoint.startsWith('unix://')
        && !/^tcp:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?$/.test(endpoint)) throw new Error();
    } catch { throw new Error('ERROR DOCKER ENGINE IS NOT WORKING OR IS NOT LOCAL'); }
  }

  async context() {
    const { env } = await this.settings();
    for (const [key, value] of Object.entries(env)) {
      if (OPENAI_VARIABLES.includes(key) || key === 'UI_PREFERENCE_COOKIE_DOMAIN') continue;
      const minimum = ['AUTH_SECRET', 'PYWORKER_API_TOKEN'].includes(key) ? 32 : 1;
      if (!value || (SECRET.test(key) && (value.length < minimum || value.includes('CHANGE_ME')))) throw new Error(`Configure QA ${key}; run pnpm qa:init.`);
    }
    for (const [key, host] of [['APP_PUBLIC_URL', 'APP_HOST'], ['AUTH_PUBLIC_URL', 'AUTH_HOST'], ['AUTH_ADMIN_PUBLIC_URL', 'AUTH_ADMIN_HOST']]) {
      const url = new URL(env[key]);
      if (url.protocol !== 'https:' || url.hostname !== env[host] || url.username || url.password || url.search || url.hash
        || url.pathname !== '/' || Number(url.port || 443) !== Number(key === 'APP_PUBLIC_URL' ? env.WEB_HTTPS_PORT : env.AUTH_LOCAL_PORT)) throw new Error(`Invalid QA ${key} or HTTPS port.`);
    }
    const runtime = { ...process.env, ...env, ...qaRuntimeVariables(env) };
    const args = composeArgs(this.root, 'qa', env);
    args[args.indexOf('--env-file') + 1] = path.resolve(this.root, this.file);
    const config = JSON.parse(await this.execute([...args, '--profile', 'maintenance', 'config', '--format', 'json'], runtime));
    if (config.name !== env.STACK_NAME) throw new Error('QA Compose project mismatch');
    for (const [name, expected] of Object.entries(runtimeEnvironments(env))) {
      const actual = config.services[name]?.environment || {};
      if (Object.keys(actual).length !== Object.keys(expected).length || Object.entries(expected).some(([key, value]) => actual[key] !== String(value))) {
        throw new Error(`Unexpected QA ${name} runtime environment; only explicitly required variables are allowed.`);
      }
    }
    for (const [name, service] of Object.entries(config.services)) {
      if (!BUILD_SERVICES.includes(name) || (service.container_name && service.container_name !== containerName(env, name))) throw new Error('Unexpected QA service ownership');
      for (const port of service.ports || []) {
        if (!['127.0.0.1', '::1'].includes(port.host_ip) || port.protocol !== 'tcp' || !/^\d+$/.test(String(port.published))) throw new Error('QA published ports must stay on loopback');
      }
    }
    for (const volume of Object.values(config.volumes || {})) {
      if (volume.external || !volume.name?.startsWith(env.STACK_NAME + '-')) throw new Error('QA volumes must belong to its isolated project');
    }
    const published = Object.values(config.services).flatMap(service => service.ports || []).map(port => Number(port.published));
    if (published.some(port => !Number.isInteger(port) || port < 1 || port > 65535) || new Set(published).size !== published.length) {
      throw new Error('QA host ports must be valid and distinct');
    }
    return { env, runtime, args, config };
  }

  async check({ certificates = true } = {}) {
    await this.engine();
    const context = await this.context();
    const rows = parseComposeRows(await this.execute([...context.args, 'ps', '--all', '--format', 'json'], context.runtime));
    const ports = [...new Set(Object.values(context.config.services).flatMap(service => service.ports || []).map(port => Number(port.published)))];
    const available = new Map(await Promise.all(ports.map(async port => [port, await this.available(port)])));
    const conflicts = qaPortConflicts(context.config, rows, available);
    if (conflicts.length) throw new Error(`ERROR QA PORTS ARE OCCUPIED: ${conflicts.join(', ')}. Stop the owning services explicitly or configure separate QA ports; DEV was not stopped.`);
    if (certificates) {
      const directory = path.resolve(this.root, 'infra/local', context.env.CERTS_DIR);
      await validateCertificates({ cert: path.join(directory, context.env.TLS_CERT_PEM), key: path.join(directory, context.env.TLS_CERT_KEY),
        ca: path.join(directory, context.env.TLS_CA_PEM), hosts: ['APP_HOST', 'WEB_HOST', 'AUTH_HOST', 'AUTH_ADMIN_HOST', 'S3_HOST'].map(key => context.env[key]), ips: [] });
    }
    this.log('[ok] QA configuration, target isolation, ports and certificates verified.');
    return context;
  }

  async images(context) {
    for (const name of BUILD_SERVICES) {
      const image = context.config.services[name]?.image;
      if (!image) throw new Error(`Missing QA image for ${name}`);
      try { await this.execute(['image', 'inspect', '--format', '{{.Id}}', image], process.env); }
      catch { throw new Error(`Missing QA ${name} image. Run pnpm qa:build:${name}.`); }
    }
  }

  async build(name) {
    name = serviceRole(name);
    if (!BUILD_SERVICES.includes(name)) throw new Error('Unknown QA image target');
    const { env } = await this.settings(false);
    const imageKey = { web: 'WEB_IMAGE', queue: 'QUEUE_IMAGE', pyworker: 'PYWORKER_IMAGE', maintenance: 'MAINTENANCE_IMAGE', auth: 'AUTH_IMAGE', s3: 'S3_IMAGE', db: 'DB_IMAGE' }[name];
    const image = env[imageKey];
    if (!/^[a-z0-9][a-zA-Z0-9._/:@-]+$/.test(image || '')) throw new Error('Invalid QA image reference');
    await this.engine();
    if (name === 'db') {
      await this.stream(['pull', image], process.env); return;
    }
    const contexts = { auth: 'infra/local/keycloak', s3: 'infra/local/seaweedfs' };
    const args = ['build', '--tag', image];
    const argument = (key, value) => args.push('--build-arg', `${key}=${value}`);
    if (contexts[name]) {
      argument(name === 'auth' ? 'KEYCLOAK_IMAGE' : 'SEAWEEDFS_IMAGE', env[name === 'auth' ? 'AUTH_BASE_IMAGE' : 'S3_BASE_IMAGE']);
      argument('NODE_IMAGE', env[name === 'auth' ? 'NODE_IMAGE' : 'S3_BOOTSTRAP_NODE_IMAGE']);
      args.push('--file', path.join(this.root, contexts[name], 'Dockerfile'), path.join(this.root, contexts[name]));
    } else {
      args.push('--file', path.join(this.root, name === 'pyworker' ? 'apps/pyworker/Dockerfile' : 'apps/web/Dockerfile'), '--target', name === 'pyworker' ? 'runtime' : name);
      argument(name === 'pyworker' ? 'PYTHON_IMAGE' : 'NODE_IMAGE', env[name === 'pyworker' ? 'PYTHON_IMAGE' : 'NODE_IMAGE']);
      if (name === 'web') for (const [key, value] of Object.entries({ APP_NAME: env.WEB_APP_NAME, LANGUAGE_COOKIE_NAME: env.WEB_LANGUAGE_COOKIE_NAME, THEME_COOKIE_NAME: env.WEB_THEME_COOKIE_NAME, CONTRAST_COOKIE_NAME: env.WEB_CONTRAST_COOKIE_NAME })) argument(key, value);
      args.push(this.root);
    }
    await this.stream(args, process.env);
  }

  async deploy() {
    const context = await this.check();
    await this.images(context);
    await this.stream([...context.args, 'stop', '--timeout', '30', ...APPS], context.runtime);
    await this.stream([...context.args, 'up', '--detach', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'db'], context.runtime);
    await this.stream([...context.args, 'run', '--rm', '--no-deps', 'maintenance', 'node', 'scripts/qa-maintenance.mjs', 'deploy'], context.runtime);
  }

  async start() {
    const context = await this.check();
    await this.images(context);
    await this.stream([...context.args, 'up', '--detach', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '240', ...INFRA], context.runtime);
    await this.stream([...context.args, 'run', '--rm', '--no-deps', 'maintenance', 'node', 'scripts/qa-maintenance.mjs', 'verify'], context.runtime);
    await this.stream([...context.args, 'up', '--detach', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '120', ...APPS], context.runtime);
    this.log('[ok] QA services are running.');
  }
}

main(import.meta.url, async () => {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { 'env-file': { type: 'string', default: 'infra/local/.env.qa' } } });
  const qa = new Qa({ file: values['env-file'] });
  const [action, service] = positionals;
  if (action === 'init') await qa.init();
  else if (action === 'check') await qa.check();
  else if (action === 'build') await qa.build(service);
  else if (action === 'deploy') await qa.deploy();
  else if (action === 'start') await qa.start();
  else if (['stop', 'status', 'logs'].includes(action)) {
    await qa.engine(); const context = await qa.context();
    const args = action === 'stop' ? ['stop', '--timeout', '30'] : action === 'logs' ? ['logs', '--tail', '100', ...APPS] : ['ps', '--all'];
    await qa.stream([...context.args, ...args], context.runtime);
  } else throw new Error('Usage: node scripts/qa.mjs init|check|build SERVICE|deploy|start|stop|status|logs [--env-file PATH]');
});
