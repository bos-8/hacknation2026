import { spawn } from 'node:child_process';
import { webEnvironment } from './web.mjs';
import { ROOT, main } from './lib/runtime.mjs';
import path from 'node:path';
import { stopChild } from './lib/child-process.mjs';

main(import.meta.url, async () => {
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts/queue-worker.mjs')], {
    cwd: ROOT, env: await webEnvironment(), stdio: ['inherit', 'inherit', 'inherit', 'ipc'], windowsHide: true,
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void stopChild(child, { graceMs: 35000 }).catch(() => { process.exitCode = 1; }); });
  child.once('error', () => { process.exitCode = 1; });
  child.once('exit', code => { process.exitCode = code ?? 1; });
});
