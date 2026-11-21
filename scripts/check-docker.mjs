import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, main, readEnvironment, logStatus } from './lib/runtime.mjs';
import { composeArgs } from './lib/compose.mjs';

const executeFile = promisify(execFile);

async function docker(args) {
  const { stdout } = await executeFile('docker', args, {
    cwd: ROOT, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024,
  });
  return stdout;
}

export async function checkDockerEngine({ execute = docker, log = logStatus } = {}) {
  try {
    const version = JSON.parse(await execute(['info', '--format', '{{json .ServerVersion}}']));
    if (typeof version !== 'string' || !version.trim()) throw new Error();
  } catch {
    // Docker diagnostics can contain host configuration; do not forward them.
    throw new Error('ERROR DOCKER ENGINE IS NOT WORKING');
  }
  log('[ok] Docker Engine is working.');
}

export function parseComposeRows(text) {
  const content = text.trim();
  if (!content) return [];
  // Compose versions emit either an array or one JSON object per line.
  const parsed = content.startsWith('[') ? JSON.parse(content) : content.split(/\r?\n/).map(line => JSON.parse(line));
  if (!Array.isArray(parsed) || parsed.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('Invalid container status response');
  }
  return parsed;
}

export function containerProblems(rows, services, project) {
  return services.flatMap(service => {
    const instances = rows.filter(row => row.Service === service && row.Project === project);
    if (!instances.length) return [`${service}=missing`];
    if (instances.some(row => row.State !== 'running')) return [`${service}=not-running`];
    if (instances.some(row => row.Health !== 'healthy')) return [`${service}=not-healthy`];
    return [];
  });
}

export async function checkDockerContainers({ root = ROOT, execute = docker, log = logStatus } = {}) {
  const env = await readEnvironment(root, 'infra/local/.env.dev');
  if (env.ENV_MODE !== 'dev' || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(env.STACK_NAME || '')) {
    throw new Error('ERROR DOCKER CONTAINERS: invalid local DEV project configuration');
  }
  const base = composeArgs(root, 'dev', env, ['tools']);
  let services, rows;
  try {
    services = (await execute([...base, 'config', '--services'])).trim().split(/\r?\n/);
    if (!services.length || services.some(service => !/^[a-z0-9][a-z0-9_-]*$/.test(service))) throw new Error();
    rows = parseComposeRows(await execute([...base, 'ps', '--all', '--format', 'json']));
  } catch {
    throw new Error('ERROR DOCKER CONTAINERS CANNOT BE VERIFIED; run pnpm check:docker and check the DEV Compose configuration');
  }
  const problems = containerProblems(rows, services, env.STACK_NAME);
  if (problems.length) {
    throw new Error(`ERROR DOCKER CONTAINERS ARE NOT READY: ${problems.join(', ')}. Run pnpm stack:up and retry.`);
  }
  for (const service of services) log(`[ok] Container ${service}: running and healthy.`);
}

main(import.meta.url, async () => {
  if (process.argv[2] === 'engine') await checkDockerEngine();
  else if (process.argv[2] === 'containers') await checkDockerContainers();
  else throw new Error('Usage: node scripts/check-docker.mjs engine|containers');
});
