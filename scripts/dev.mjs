import { rm, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { clean } from './clean.mjs';
import { ROOT, main, safePath, readEnvironment, logStatus } from './lib/runtime.mjs';
import { devPorts, checkPorts } from './check-ports.mjs';
import { ownDev, stopDev, runPnpm } from './lib/dev-process.mjs';
import { checkDevTools } from './lib/dev-tools.mjs';

const components = { web: 'apps/web', pyworker: 'apps/pyworker', prisma: 'packages/database',
  queue: 'packages/queue', monitoring: 'packages/monitoring', docker: null };

export async function existingPython(root = ROOT) {
  if (process.env.PYWORKER_PYTHON) return { PYWORKER_PYTHON: process.env.PYWORKER_PYTHON };
  const directory = await safePath(root, 'apps/pyworker/.venv');
  if (!directory) return {};
  // POSIX virtualenv executables normally link to the base interpreter outside the workspace.
  const executable = path.join(directory, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  try { await access(executable); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  const { stdout } = await promisify(execFile)(executable, ['-I', '-c', 'import sys; print(sys._base_executable)'], { windowsHide: true, timeout: 10000 });
  return { PYWORKER_PYTHON: stdout.trim() };
}

async function optionalEnvironment(root, file) {
  return await safePath(root, file) ? readEnvironment(root, file) : {};
}

export async function checkHostStopped(root = ROOT) {
  const web = await optionalEnvironment(root, 'apps/web/.env');
  const python = await optionalEnvironment(root, 'apps/pyworker/.env');
  await checkPorts(devPorts(web, python, process.env));
}

/** Fixed generated paths only; resolve and recheck each target before deletion. */
export async function cleanComponent(root, component) {
  if (!Object.hasOwn(components, component) || component === 'docker') throw new Error('Unknown host component');
  const owner = components[component];
  const directory = await safePath(root, owner);
  if (!directory) return;
  const names = component === 'pyworker' ? ['.venv', '.cache', '.ruff_cache', '__pycache__']
    : ['dist', 'build', '.next', 'out', 'coverage', '.turbo', '.eslintcache'];
  for (const entry of await readdir(directory)) if (entry.endsWith('.tsbuildinfo')) names.push(entry);
  for (const name of names) {
    const relative = path.join(owner, name);
    const target = await safePath(root, relative);
    if (!target) continue;
    if (await safePath(root, relative) !== target) throw new Error('Cleanup target changed');
    logStatus(`[clean] ${relative}`);
    await rm(target, { recursive: true, force: false, maxRetries: 2 });
  }
}

/** Reusable workflow: tests supply harmless commands and disposable generated paths. */
export async function devWorkflow(action, component, {
  root = ROOT, run, checkStopped = () => checkHostStopped(root),
  cleanAll = () => clean(root), cleanPart = name => cleanComponent(root, name),
  pythonBase = () => existingPython(root),
  checkTools = async () => checkDevTools({ root, python: await pythonBase() }),
  log = logStatus,
} = {}) {
  if (!['start', 'warm', 'cold', 'restart', 'rebuild', 'clean', 'stop'].includes(action) ||
      (component && (action !== 'rebuild' || !Object.hasOwn(components, component)))) throw new Error('Invalid DEV lifecycle command');
  if (['warm', 'cold'].includes(action)) action = 'start';
  if (['start', 'restart'].includes(action)) {
    let number = 0;
    const step = async (label, operation) => {
      const current = ++number;
      const started = Date.now();
      log(`[info] DEV ${current}/8: ${label}`);
      const timer = setInterval(() => log(`[wait] DEV ${current}/8: ${label} (${Math.floor((Date.now() - started) / 1000)}s)`), 15000);
      timer.unref();
      try {
        const result = await operation();
        log(`[ok] DEV ${current}/8: ${label} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
        return result;
      } catch (error) {
        log(`[error] DEV ${current}/8 stopped: ${label}. Fix the reported problem and run pnpm dev again.`);
        throw error;
      } finally { clearInterval(timer); }
    };
    const python = await step('Node, pnpm, Docker Engine/Compose and Python', checkTools);
    await step('DEV configuration, TLS and available host ports', async () => {
      await checkStopped();
      await run(['run', 'validate:dev']);
      await run(['run', 'validate:certs']);
    });
    await step('Synchronize locked pnpm packages (cached when available)', () => run(['install', '--frozen-lockfile', '--prefer-offline']));
    await step('Validate application authentication', () => run(['run', 'check:dev-auth']));
    await step('Prepare Python virtualenv and locked dependencies', () => run(['run', 'pyworker:prepare'], python));
    await step('Build/start Compose with cache and wait for healthy services', async () => {
      if (action === 'restart') await run(['run', 'dev:infra:down']);
      await run(['run', 'dev:infra:up']);
    });
    await step('Build shared packages/Prisma, prepare queue, migrate and seed', () => run(['run', 'dev:prepare:application']));
    log('[info] DEV 8/8: starting Web, queue and Python; Ctrl+C stops host services.');
    await run(['run', 'dev:services'], { FORMIQ_DEV_PREPARED: 'true' });
    return;
  }
  await checkStopped();
  if (action === 'stop') { await run(['run', 'dev:infra:down']); return; }
  if (action === 'clean') { await cleanAll(); return; }
  if (action === 'rebuild' && component === 'pyworker') {
    const python = await pythonBase();
    await cleanPart('pyworker');
    await run(['run', 'pyworker:setup'], python);
    return;
  }
  if (action === 'rebuild' && component === 'docker') {
    await run(['run', 'check:docker']);
    await run(['run', 'dev:infra:down']);
    await run(['run', 'dev:infra:up']);
    return;
  }

  await run(['install', '--frozen-lockfile']);
  // Validate before deleting outputs, restarting Docker or applying migrations. Never rotate secrets here.
  if (!component || component === 'web') await run(['run', 'check:dev-auth']);
  const python = action === 'rebuild' && (!component || component === 'pyworker') ? await pythonBase() : {};
  if (action === 'rebuild' && component) {
    await cleanPart(component);
    if (component === 'web') await run(['run', 'dev:build']);
    if (component === 'monitoring') await run(['run', 'build:database']);
    await run(['run', { web: 'dev:check:web', prisma: 'build:database', queue: 'build:queue', monitoring: 'build:monitoring' }[component]]);
    return;
  }
  if (action === 'rebuild') {
    await run(['run', 'dev:infra:down']);
    await cleanAll();
    await cleanPart('pyworker');
    await run(['install', '--frozen-lockfile']);
  }
  await run(['run', 'pyworker:setup'], python);
  await run(['run', 'validate:dev']);
  await run(['run', 'validate:certs']);
  await run(['run', 'check:docker']);
  await run(['run', 'dev:infra:up']);
  await run(['run', 'dev:prepare:application']);
  if (action === 'rebuild') {
    await run(['run', 'dev:check:web']);
  }
  await run(['run', 'terminal:clear']);
  await run(['run', 'dev:services'], { FORMIQ_DEV_PREPARED: 'true' });
}

main(import.meta.url, async () => {
  const [action = 'start', component, ...extra] = process.argv.slice(2);
  if (extra.length || !['start', 'warm', 'cold', 'restart', 'rebuild', 'clean', 'stop'].includes(action) ||
      (component && (action !== 'rebuild' || !Object.hasOwn(components, component)))) {
    throw new Error('Usage: node scripts/dev.mjs [start|warm|cold|restart|rebuild [web|pyworker|prisma|queue|monitoring|docker]|clean|stop]');
  }
  // Rebuild/restart/stop can stop only a session started by this supervisor.
  if (['restart', 'stop'].includes(action) || action === 'rebuild' && !component) await stopDev(ROOT);
  await ownDev(ROOT, async signal => {
    await devWorkflow(action, component, { run: (args, env) => runPnpm(ROOT, args, signal, env) });
  });
});
