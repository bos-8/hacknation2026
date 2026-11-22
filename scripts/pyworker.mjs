import { spawn, execFile } from 'node:child_process';
import { watch } from 'node:fs';
import { stopChild as stopOwnedChild } from './lib/child-process.mjs';
import { workerControl } from './lib/worker-control.mjs';
import { promisify } from 'node:util';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { ROOT, main, safePath } from './lib/runtime.mjs';

const execute = promisify(execFile);
export const pyworkerDirectory = path.join(ROOT, 'apps/pyworker');
const environmentDirectory = path.join(pyworkerDirectory, '.venv');
const python = path.join(environmentDirectory, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

async function run(command, args, options = {}) {
  const code = await new Promise((resolve, reject) => {
    const controlled = args[0] === '-m' && args[1] === 'pyworker';
    const child = spawn(command, args, { cwd: pyworkerDirectory, windowsHide: true, stdio: 'inherit', ...options,
      ...(controlled ? { stdio: ['pipe', 'inherit', 'inherit'], env: { ...options.env, PYWORKER_PARENT_CONTROL: 'stdin' } } : {}) });
    if (controlled) child.stdin.on('error', () => {});
    let interrupted = false;
    const signals = ['SIGINT', 'SIGTERM'].map(signal => {
      const handler = () => {
        interrupted = true;
        if (controlled) { void stopOwnedChild(child).catch(() => { process.exitCode = 1; }); return; }
        if (process.platform === 'win32' && child.pid) {
          execFile(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
        } else child.kill(signal);
      };
      process.once(signal, handler);
      return [signal, handler];
    });
    const clear = () => { for (const [signal, handler] of signals) process.removeListener(signal, handler); };
    child.once('error', error => { clear(); reject(error); });
    child.once('exit', code => { clear(); resolve(interrupted ? 0 : code ?? 1); });
  });
  if (code !== 0) throw new Error(`Python command failed (${code})`);
}

/** Own a single Python process; source-only reload also works without Python multiprocessing. */
async function runDevelopment(env) {
  const source = path.join(pyworkerDirectory, 'src');
  return new Promise((resolve, reject) => {
    let child, timer, closeControl, shutdownTask, restarting = false, queued = false, stopping = false;
    const launch = () => {
      child = spawn(python, ['-m', 'pyworker'], { cwd: pyworkerDirectory, env: { ...env, PYWORKER_PARENT_CONTROL: 'stdin' }, stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
      child.stdin.on('error', () => {});
      child.once('error', () => void shutdown(new Error('Python worker could not start')));
      child.once('exit', code => { if (!stopping && !restarting && code) console.error('[pyworker] Process exited; waiting for a source change.'); });
    };
    const stopChild = async () => {
      await stopOwnedChild(child);
    };
    const restart = async () => {
      if (stopping) return;
      if (restarting) { queued = true; return; }
      restarting = true;
      try { await stopChild(); if (!stopping) { console.log('[pyworker] Source changed; restarting.'); launch(); } }
      finally { restarting = false; if (queued && !stopping) { queued = false; timer = setTimeout(() => void restart(), 150); } }
    };
    const watcher = watch(source, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const name = filename.toString().replaceAll('\\', '/');
      if (!name.toLowerCase().endsWith('.py') || name.split('/').some(part => ['__pycache__','.cache','.venv'].includes(part) || part.startsWith('.'))) return;
      clearTimeout(timer); timer = setTimeout(() => void restart(), 150);
    });
    const interrupt = () => void shutdown();
    const parentMessage = message => { if (message?.type === 'shutdown') void shutdown(); };
    function shutdown(error) {
      if (shutdownTask) return shutdownTask;
      stopping = true; watcher.close(); clearTimeout(timer);
      process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
      process.removeListener('message', parentMessage);
      shutdownTask = (async () => { await stopChild(); closeControl?.(); if (process.connected) process.disconnect(); if (error) reject(error); else resolve(); })();
      return shutdownTask;
    }
    watcher.once('error', () => void shutdown(new Error('Python source watcher unavailable')));
    process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
    process.on('message', parentMessage);
    console.log('[pyworker] DEV watches src/**/*.py; environments and caches are excluded.');
    launch();
    if (process.env.FORMIQ_DEV_PREPARED === 'true') {
      void workerControl(ROOT, 'pyworker', shutdown).then(close => { closeControl = close; if (stopping) close(); }, () => void shutdown(new Error('Worker control unavailable')));
    }
  });
}

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function readLocal(file) {
  try { return parseEnv(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

function validToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,}$/.test(value) && !value.includes('CHANGE_ME');
}

async function updateEnvironment(file, additions) {
  await safePath(ROOT, file);
  let content = '';
  try { content = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const before = content;
  const existing = parseEnv(content);
  for (const [key, value] of Object.entries(additions)) {
    if (existing[key] === value) continue;
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    content = pattern.test(content) ? content.replace(pattern, () => line) : content.trimEnd() + '\n' + line + '\n';
  }
  if (content !== before) await writeFile(file, content, { mode: 0o600 });
}

async function prepareConfiguration() {
  const file = path.join(pyworkerDirectory, '.env');
  const webFile = path.join(ROOT, 'apps/web/.env');
  await safePath(ROOT, file);
  await safePath(ROOT, webFile);
  if (!await exists(file)) await writeFile(file, await readFile(path.join(pyworkerDirectory, '.env.example')), { mode: 0o600 });
  const local = await readLocal(file);
  const web = await readLocal(webFile);
  // Migrate only the published bridge placeholder; never replace private credentials.
  if (web.PYWORKER_QUEUE_BRIDGE_PORT && web.PYWORKER_QUEUE_TOKEN === 'CHANGE_ME') {
    if (local.PYWORKER_QUEUE_TOKEN && local.PYWORKER_QUEUE_TOKEN !== web.PYWORKER_QUEUE_TOKEN) {
      throw new Error('Published Web bridge placeholder differs from the private Python token; reconcile the bridge env files');
    }
    const bridgeToken = randomBytes(32).toString('hex');
    await updateEnvironment(file, { PYWORKER_QUEUE_TOKEN: bridgeToken });
    await updateEnvironment(webFile, { PYWORKER_QUEUE_TOKEN: bridgeToken });
  }
  if (validToken(local.PYWORKER_API_TOKEN) && validToken(web.PYWORKER_API_TOKEN) && local.PYWORKER_API_TOKEN !== web.PYWORKER_API_TOKEN) throw new Error('Python/Web worker tokens differ; reconcile the private env files');
  const token = validToken(local.PYWORKER_API_TOKEN) ? local.PYWORKER_API_TOKEN : validToken(web.PYWORKER_API_TOKEN) ? web.PYWORKER_API_TOKEN : randomBytes(32).toString('hex');
  await updateEnvironment(file, { PYWORKER_API_TOKEN: token });
  const host = local.PYWORKER_HOST || '127.0.0.1';
  const port = local.PYWORKER_PORT || '8010';
  if (!['127.0.0.1', '::1'].includes(host) || !/^\d{4,5}$/.test(port) || Number(port) > 65535 || Number(port) < 1024) throw new Error('Invalid local Python worker address');
  const base = `http://${host === '::1' ? '[::1]' : host}:${port}`;
  const placeholders = await readLocal(path.join(ROOT, 'apps/web/.env.example'));
  const additions = {};
  for (const [key, value] of Object.entries({ PYWORKER_API_TOKEN: token, PYWORKER_URL: base, MONITOR_PYWORKER_URL: `${base}/health/ready` })) {
    if (!web[key] || web[key] === placeholders[key] || key === 'PYWORKER_API_TOKEN' && !validToken(web[key])) additions[key] = value;
  }
  // The worker has no application/database credentials; only Web's private bridge config is linked.
  if (await exists(webFile)) await updateEnvironment(webFile, additions);
}

export async function pyworkerEnvironment(root = ROOT, inherited = process.env) {
  const directory = path.join(root, 'apps/pyworker');
  const local = await readLocal(path.join(directory, '.env'));
  // Explicit process needs; application credentials never cross this boundary.
  const runtimeKeys = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'NO_COLOR', 'FORCE_COLOR', 'SSL_CERT_FILE', 'SSL_CERT_DIR']);
  const workerKeys = new Set(['PYWORKER_HOST', 'PYWORKER_PORT', 'PYWORKER_API_TOKEN', 'PYWORKER_MAX_CONCURRENCY', 'PYWORKER_TASK_TIMEOUT_SECONDS', 'PYWORKER_LOG_LEVEL', 'PYWORKER_DATABASE_URL', 'PYWORKER_QUEUE_URL', 'PYWORKER_QUEUE_TOKEN',
    'PYWORKER_FORM_MODE', 'EDENAI_API_KEY', 'EDENAI_UPLOAD_URL', 'EDENAI_LLM_URL', 'EDENAI_LLM_MODEL', 'EDENAI_TIMEOUT_SECONDS', 'PYWORKER_LOCAL_LLM_URL', 'PYWORKER_LOCAL_LLM_MODEL',
    'PYWORKER_HARNESS_API_URL', 'PYWORKER_HARNESS_API_KEY', 'PYWORKER_HARNESS_EXPIRES_AT', 'EDENAI_MAX_INPUT_CHARS', 'EDENAI_MAX_OUTPUT_TOKENS', 'EDENAI_VISION_MODEL',
    'PYWORKER_PIPELINE_TIMEOUT_SECONDS', 'PYWORKER_PIPELINE_ASSETS', 'PYWORKER_DOCUMENT_PYTHON', 'PYWORKER_DOCUMENT_DEVICE', 'PYWORKER_DOC_CLASSPATH',
    'PYWORKER_PIPELINE_PROMPT_FILE']);
  const runtime = Object.fromEntries(Object.entries(inherited).filter(([key]) => runtimeKeys.has(key.toUpperCase()) || workerKeys.has(key)));
  return { ...runtime, ...Object.fromEntries(Object.entries(local).filter(([key]) => workerKeys.has(key) && !(key in inherited))),
    PYTHONPATH: path.join(directory, 'src'), PYTHONNOUSERSITE: '1',
    PYTHONPYCACHEPREFIX: path.join(directory, '.cache/pycache'), PIP_CACHE_DIR: path.join(directory, '.cache/pip'),
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
  };
}

async function prepare(force = false, install = true) {
  await safePath(ROOT, environmentDirectory);
  await safePath(ROOT, path.join(pyworkerDirectory, '.cache'));
  const lock = await readFile(path.join(pyworkerDirectory, 'requirements.lock'));
  const stamp = createHash('sha256').update(lock).digest('hex');
  if (!await exists(python)) {
    if (!install) throw new Error('Run pnpm pyworker:setup before starting Python');
    const base = process.env.PYWORKER_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    let version;
    try { version = JSON.parse((await execute(base, ['-I', '-c', 'import json,sys; print(json.dumps(list(sys.version_info[:2])))'], { windowsHide: true })).stdout); }
    catch { throw new Error('Python 3.12–3.14 required; set PYWORKER_PYTHON to its executable'); }
    if (version[0] !== 3 || version[1] < 12 || version[1] > 14) throw new Error('Python 3.12–3.14 required');
    await run(base, ['-m', 'venv', environmentDirectory]);
  }
  const identity = JSON.parse((await execute(python, ['-I', '-c', 'import json,sys; print(json.dumps({"version":list(sys.version_info[:2]),"prefix":sys.prefix,"isolated":sys.prefix!=sys.base_prefix}))'], { windowsHide: true })).stdout);
  const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (!identity.isolated || normalize(identity.prefix) !== normalize(environmentDirectory) || identity.version[0] !== 3 || identity.version[1] < 12 || identity.version[1] > 14) throw new Error('Expected apps/pyworker/.venv with Python 3.12–3.14');
  if (install) await prepareConfiguration();
  const env = await pyworkerEnvironment();
  let installed;
  try { installed = await readFile(path.join(environmentDirectory, '.requirements.sha256'), 'utf8'); } catch { /* First install. */ }
  if (force || installed !== stamp) {
    if (!install) throw new Error('Dependencies changed; run pnpm pyworker:setup');
    await run(python, ['-m', 'pip', 'install', '--require-hashes', '--only-binary=:all:', '-r', 'requirements.lock'], { env });
    await run(python, ['-m', 'pip', 'check'], { env });
    await writeFile(path.join(environmentDirectory, '.requirements.sha256'), stamp);
  }
  return env;
}

main(import.meta.url, async () => {
  const action = process.argv[2];
  if (!['setup', 'prepare', 'dev', 'start', 'test', 'lint'].includes(action)) throw new Error('Usage: node scripts/pyworker.mjs setup|prepare|dev|start|test|lint');
  const install = ['setup', 'prepare'].includes(action) || action === 'dev' && process.env.FORMIQ_DEV_PREPARED !== 'true';
  const env = await prepare(action === 'setup', install);
  if (['setup', 'prepare'].includes(action)) { console.log('[ok] Python virtualenv and private worker configuration ready.'); return; }
  if (action === 'test') return run(python, ['-m', 'unittest', 'discover', '-s', 'tests', '-v'], { env });
  if (action === 'lint') {
    await run(python, ['-m', 'ruff', 'check', 'src', 'tests'], { env });
    return run(python, ['-m', 'ruff', 'format', '--check', 'src', 'tests'], { env });
  }
  if (action === 'dev') return runDevelopment(env);
  await run(python, ['-m', 'pyworker'], { env });
});
