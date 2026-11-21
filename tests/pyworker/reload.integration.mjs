import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { stopChild } from '../../scripts/lib/child-process.mjs';
import { createServer } from 'node:net';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { ROOT } from '../../scripts/lib/runtime.mjs';
import { pyworkerDirectory } from '../../scripts/pyworker.mjs';

const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const child = spawn(process.execPath, [path.join(ROOT, 'scripts/pyworker.mjs'), 'dev'], {
  cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  env: { ...process.env, PYWORKER_PORT: String(port), PYWORKER_API_TOKEN: randomBytes(32).toString('hex') },
});
let log = '';
const collect = chunk => { if (log.length < 100000) log += chunk.toString(); };
child.stdout.on('data', collect); child.stderr.on('data', collect);
const starts = () => [...log.matchAll(/Started server process/g)].length;
const base = `http://127.0.0.1:${port}`;
async function ready() { try { return (await fetch(base + '/health/ready', { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } }
async function waitFor(predicate) {
  const end = Date.now() + 30000;
  while (Date.now() < end) { if (await predicate()) return; if (child.exitCode !== null) throw new Error('Python DEV exited'); await delay(100); }
  throw new Error('Python DEV condition timed out');
}
const name = `reload_canary_${randomBytes(6).toString('hex')}.py`;
const paths = ['.cache', '.venv', 'src/pyworker/__pycache__'].map(folder => path.join(pyworkerDirectory, folder, name));
const source = path.join(pyworkerDirectory, 'src/pyworker', name);
const created = [];
try {
  await waitFor(ready);
  const count = starts(); assert.ok(count >= 1);
  for (const file of paths) {
    assert.ok(file.startsWith(pyworkerDirectory + path.sep));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '# cache change must not restart the worker\n', { flag: 'wx' }); created.push(file);
  }
  await delay(3000);
  assert.equal(starts(), count, 'Cache/venv changes must not restart Python');
  await writeFile(source, '# source change must restart the worker\n', { flag: 'wx' }); created.push(source);
  await waitFor(async () => starts() > count && await ready());
  assert.equal((await (await fetch(base + '/health')).json()).status, 'ok');
  console.log('PASS DEV reload after Python source change, no reload for .venv/.cache/__pycache__, and healthy restarted worker');
} catch (error) {
  console.error(log.slice(-3000).replace(/Bearer\s+\S+/g, 'Bearer [redacted]'));
  throw error;
} finally {
  try { await stopChild(child); }
  finally { for (const file of created) await unlink(file); }
}
