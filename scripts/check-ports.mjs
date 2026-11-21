import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { ROOT, readEnvironment, safePath, main, logStatus } from './lib/runtime.mjs';

const execute = promisify(execFile);

export function parsePort(value) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('Port must be an integer between 1 and 65535.');
  }
  return Number(value);
}

export function devPorts(web, python, inherited = {}) {
  const values = [
    inherited.PORT || web.PORT || 3000,
    inherited.PYWORKER_PORT || python.PYWORKER_PORT || 8010,
  ];
  const bridge = inherited.PYWORKER_QUEUE_BRIDGE_PORT ?? web.PYWORKER_QUEUE_BRIDGE_PORT;
  if (bridge || inherited.PYWORKER_API_TOKEN || web.PYWORKER_API_TOKEN) values.push(bridge || 8011);
  const ports = values.map(parsePort);
  if (new Set(ports).size !== ports.length) {
    throw new Error('DEV Web, Python and optional queue bridge must use distinct ports');
  }
  return ports;
}

function probe(port, host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.destroy());
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(false);
      else if (host.includes(':') && ['EAFNOSUPPORT', 'EADDRNOTAVAIL', 'EPROTONOSUPPORT'].includes(error.code)) resolve(true);
      else reject(new Error(`Cannot check port ${port}: ${error.code}.`));
    });
    server.listen({ port, host, exclusive: true, ipv6Only: host.includes(':') }, () => {
      server.close((error) => error ? reject(error) : resolve(true));
    });
  });
}

export async function portAvailable(value) {
  const port = parsePort(value);
  // Windows may allow a wildcard bind alongside a loopback-only listener.
  for (const host of ['127.0.0.1', '::1', '0.0.0.0', '::']) {
    if (!await probe(port, host)) return false;
  }
  return true;
}

async function output(command, args) {
  try {
    return (await execute(command, args, { timeout: 10000, windowsHide: true, maxBuffer: 1048576 })).stdout;
  } catch { return ''; }
}

export function parseListeners(text, port, platform) {
  const found = new Set();
  for (const line of text.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (platform === 'win32') {
      if (fields[0] === 'TCP' && fields[1]?.endsWith(`:${port}`) && fields[3] === 'LISTENING') {
        if (/^\d+$/.test(fields[4])) found.add(Number(fields[4]));
      }
    } else if (fields[0] === 'LISTEN' && fields[3]?.endsWith(`:${port}`)) {
      for (const match of line.matchAll(/pid=(\d+)/g)) found.add(Number(match[1]));
    }
  }
  return [...found].filter((pid) => Number.isSafeInteger(pid) && pid > 0);
}

export async function listenerPids(value) {
  const port = parsePort(value);
  if (process.platform === 'win32') {
    // Only the validated integer is interpolated. No command line or environment values are read.
    const result = await output('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`]);
    const pids = result.trim().split(/\s+/).filter((pid) => /^\d+$/.test(pid)).map(Number);
    if (pids.length) return [...new Set(pids)];
    return parseListeners(await output('netstat.exe', ['-ano', '-p', 'tcp']), port, 'win32');
  }
  const result = await output('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  const pids = result.trim().split(/\s+/).filter((pid) => /^\d+$/.test(pid)).map(Number);
  if (pids.length) return [...new Set(pids)];
  return parseListeners(await output('ss', ['-H', '-ltnp']), port, process.platform);
}

export function stopCommand(pid, platform = process.platform) {
  if (!Number.isSafeInteger(pid) || pid <= 4) return null;
  return platform === 'win32' ? `Stop-Process -Id ${pid}` : `kill -TERM ${pid}`;
}

export async function checkPorts(ports, { log = logStatus } = {}) {
  let busy = 0;
  for (const port of [...new Set(ports.map(parsePort))]) {
    if (await portAvailable(port)) {
      log(`[ok] Port ${port} is available.`);
      continue;
    }
    busy++;
    const pids = await listenerPids(port);
    log(`[busy] Port ${port}: an instance or another service is already running.`);
    if (!pids.length) log('  PID unavailable. Inspect the listener with your OS network tools.');
    for (const pid of pids) {
      const command = stopCommand(pid);
      log(`  PID ${pid}`);
      if (command) log(`  After confirming the owner, stop it manually: ${command}`);
      else log('  System process, inspect the owning service instead of terminating it.');
    }
    log('  Prefer Ctrl+C in the original terminal. For Docker-owned ports, stop the container/service.');
  }
  if (busy) throw new Error(`${busy} port(s) occupied. No process was stopped.`);
  log('[ok] Point-in-time check only, start the application immediately to minimize races.');
}

main(import.meta.url, async () => {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    port: { type: 'string', multiple: true }, dev: { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: pnpm check:ports [PORT ...] [--port PORT] [--dev]\nDefault: Web port. --dev: Web, Python and optional Node queue bridge. Never terminates a process.');
    return;
  }
  const ports = [...positionals, ...(values.port ?? [])];
  if (values.dev) {
    if (ports.length) throw new Error('Use --dev or explicit ports, not both');
    const [web, python] = await Promise.all([
      readEnvironment(ROOT, 'apps/web/.env'), readEnvironment(ROOT, 'apps/pyworker/.env'),
    ]);
    ports.push(...devPorts(web, python, process.env));
  }
  if (!ports.length) {
    for (const [app, fallback] of [['web', 3000]]) {
      const file = `apps/${app}/.env`;
      const env = await safePath(ROOT, file) ? await readEnvironment(ROOT, file) : {};
      ports.push(env.PORT ?? fallback);
    }
  }
  await checkPorts(ports);
});
