import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pnpmInvocation } from './dev-process.mjs';
import { ROOT, logStatus } from './runtime.mjs';

const executeFile = promisify(execFile);

/** Built-ins only: this preflight must work before the first pnpm install. */
export async function checkDevTools({ root = ROOT, inherited = process.env, python = {},
  nodeVersion = process.versions.node, platform = process.platform, log = logStatus,
  execute = (command, args, options = {}) => executeFile(command, args, {
    cwd: root, windowsHide: true, timeout: 10000, ...options,
  }),
} = {}) {
  const [major, minor] = nodeVersion.split('.').map(Number);
  if (major < 22 || major === 22 && minor < 18) throw new Error('Node.js 22.18+ required for native TypeScript loading; the documented runtime is Node.js 26.');
  log(`[ok] Node.js ${nodeVersion}`);
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const expected = manifest.packageManager?.match(/^pnpm@([^+]+)/)?.[1];
  const invocation = pnpmInvocation(inherited.npm_execpath || 'pnpm');
  let version;
  try { version = (await execute(invocation.command, [...invocation.prefix, '--version'], { shell: invocation.shell })).stdout.trim(); }
  catch { throw new Error('pnpm is unavailable. Install the packageManager version declared in package.json.'); }
  if (expected && version !== expected) throw new Error(`pnpm ${expected} required by package.json; found ${version}.`);
  log(`[ok] pnpm ${version}`);
  try {
    const response = JSON.parse((await execute('docker', ['info', '--format', '{{json .ServerVersion}}'])).stdout);
    if (typeof response !== 'string' || !response.trim()) throw new Error();
    if (!(await execute('docker', ['compose', 'version', '--short'])).stdout.trim()) throw new Error();
  } catch { throw new Error('Docker Engine or Compose is unavailable. Start Docker Desktop / Docker Engine, check access with pnpm check:docker, then run pnpm dev again.'); }
  log('[ok] Docker Engine and Compose');
  const override = inherited.PYWORKER_PYTHON || python.PYWORKER_PYTHON;
  const candidates = override ? [[override, []]] : [
    [platform === 'win32' ? 'python' : 'python3', []],
    ...[14, 13, 12].map(minor => platform === 'win32' ? ['py', [`-3.${minor}`]] : [`python3.${minor}`, []]),
  ];
  for (const [command, prefix] of candidates) {
    try {
      const result = JSON.parse((await execute(command, [...prefix, '-I', '-c',
        'import json,sys; print(json.dumps({"version":list(sys.version_info[:2]),"executable":sys._base_executable}))'])).stdout);
      if (result.version?.[0] === 3 && result.version[1] >= 12 && result.version[1] <= 14 && result.executable) {
        log(`[ok] Python ${result.version.join('.')}`);
        return { PYWORKER_PYTHON: result.executable };
      }
    } catch { /* Probe the next installed interpreter; never download one. */ }
  }
  throw new Error('Python 3.12–3.14 required. Install a supported interpreter or set PYWORKER_PYTHON to its executable, then run pnpm dev again.');
}
