import net from 'node:net';
import path from 'node:path';
import { mkdir, realpath } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { safePath } from './runtime.mjs';
import { drainWorker } from './worker-control.mjs';
import { controlAddress } from './control-address.mjs';
export { controlAddress } from './control-address.mjs';

const execute = promisify(execFile);

/** Ask the owning supervisor to stop; never discover or kill a PID by port/name. */
export function stopDev(root) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(controlAddress(root));
    let response = '';
    socket.setTimeout(95000, () => socket.destroy(new Error('DEV shutdown timed out; inspect the original terminal.')));
    socket.once('connect', () => socket.write('stop\n'));
    socket.on('data', data => { response += data; if (response.length > 64) socket.destroy(new Error('Invalid DEV control response')); });
    socket.once('error', error => ['ENOENT', 'ECONNREFUSED'].includes(error.code) ? resolve(false) : reject(error));
    socket.once('end', () => response === 'stopped\n' ? resolve(true) : reject(new Error('DEV shutdown did not finish.')));
  });
}

/** A workspace-scoped lock and stop channel, held throughout setup and runtime. */
export async function ownDev(root, action) {
  root = await realpath(root);
  await safePath(root, '.local');
  await mkdir(path.join(root, '.local'), { recursive: true });
  await safePath(root, '.local');
  if (process.platform !== 'win32') await safePath(root, '.local/dev-control.sock');
  const controller = new AbortController();
  const clients = new Set();
  const server = net.createServer(socket => {
    clients.add(socket);
    socket.setTimeout(1000, () => socket.destroy());
    socket.once('close', () => clients.delete(socket));
    socket.on('error', () => {});
    let request = '';
    socket.on('data', data => {
      request += data;
      if (request === 'stop\n') { socket.setTimeout(0); controller.abort(); }
      else if (request.length > 5 || !'stop\n'.startsWith(request)) socket.destroy();
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', error => reject(new Error(error.code === 'EADDRINUSE'
      ? 'DEV is already running or another lifecycle command is active. Use pnpm dev:stop first.'
      : `Cannot open DEV control channel (${error.code}).`)));
    server.listen(controlAddress(root), resolve);
  });
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  let failed = false;
  try {
    await action(controller.signal);
  } catch (error) {
    if (error !== controller.signal.reason) { failed = true; throw error; }
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    await new Promise(resolve => {
      server.close(resolve);
      for (const socket of clients) socket.end(failed ? 'failed\n' : 'stopped\n');
    });
  }
}

export function pnpmInvocation(executable = process.env.npm_execpath || 'pnpm') {
  return /\.[cm]?js$/.test(executable)
    ? { command: process.execPath, prefix: [executable], shell: false }
    : { command: executable, prefix: [], shell: process.platform === 'win32' && !/\.exe$/i.test(executable) };
}

/** Own the child and its descendants, including pnpm's three host services. */
export function runPnpm(root, args, signal, environment = {}) {
  signal?.throwIfAborted();
  const { command, prefix, shell } = pnpmInvocation();
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...prefix, ...args], {
      cwd: root, stdio: 'inherit', windowsHide: true, shell, env: { ...process.env, ...environment },
      detached: process.platform !== 'win32',
    });
    let stopFailure;
    let stopping;
    const stop = () => {
      if (stopping || !child.pid || child.exitCode !== null || child.signalCode) return;
      stopping = (async () => {
        if (process.platform === 'win32') {
          try {
            // Drain consumers before Python, while their HTTP executor remains available.
            for (const role of ['queue', 'pyworker']) {
              try { await drainWorker(root, role); }
              catch { stopFailure = new Error('Worker drain failed; the owned process tree required forced shutdown.'); }
            }
            await execute(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/taskkill.exe'),
              ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10000 });
          } catch {
            if (child.exitCode === null && !child.signalCode) {
              stopFailure = new Error('Could not stop the owned DEV process tree. Inspect the original terminal.');
              reject(stopFailure);
            }
          }
        } else {
          try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') stopFailure = error; }
        }
      })();
    };
    signal?.addEventListener('abort', stop, { once: true });
    const clear = () => signal?.removeEventListener('abort', stop);
    child.once('error', () => { clear(); reject(new Error(`Could not launch pnpm ${args.join(' ')}.`)); });
    child.once('close', async code => {
      clear();
      await stopping;
      if (stopFailure) reject(stopFailure);
      else if (signal?.aborted) reject(signal.reason);
      else if (code !== 0) reject(new Error(`pnpm ${args.join(' ')} failed (${code}).`));
      else resolve();
    });
    if (signal?.aborted) stop();
  });
}
