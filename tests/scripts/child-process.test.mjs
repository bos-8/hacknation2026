import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { stopChild } from '../../scripts/lib/child-process.mjs';
import { workerControl, drainWorker } from '../../scripts/lib/worker-control.mjs';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('cleanup returns immediately for a child that exited before cleanup started', async () => {
  const child = spawn(process.execPath, ['-e', '']);
  await once(child, 'exit');
  await stopChild(child, { graceMs: 10 });
});

test('IPC shutdown drains active work and coalesces concurrent reload/stop requests', async () => {
  const child = spawn(process.execPath, ['-e', `
    const active = new Promise(resolve => setTimeout(resolve, 200));
    process.on('message', async message => {
      if (message.type !== 'shutdown') return;
      await active; process.send('completed', () => process.disconnect());
    }); process.send('ready');
  `], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
  await once(child, 'message');
  const completed = once(child, 'message');
  const first = stopChild(child, { graceMs: 2000 });
  const second = stopChild(child, { graceMs: 2000 });
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.deepEqual((await completed)[0], 'completed');
  assert.equal(child.exitCode, 0);
});

test('cleanup forces an unresponsive owned child within a bounded interval', async () => {
  const child = spawn(process.execPath, ['-e', `process.on('message', () => {}); process.send('ready');`], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
  await once(child, 'message');
  const started = Date.now();
  await stopChild(child, { graceMs: 30, forceMs: 2000 });
  assert.ok(Date.now() - started < 2200);
});

test('supervisor and worker share one shutdown address despite a trailing root separator', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'modulon-worker-control-'));
  await mkdir(path.join(root, '.local'));
  t.after(async () => {
    const resolved = await realpath(root);
    assert.equal(path.dirname(resolved).toLowerCase(), (await realpath(os.tmpdir())).toLowerCase());
    assert.ok(path.basename(resolved).startsWith('modulon-worker-control-'));
    await rm(resolved, { recursive: true, force: true });
  });
  let completed = false;
  const close = await workerControl(root + path.sep, 'queue', async () => {
    await new Promise(resolve => setTimeout(resolve, 50)); completed = true;
  });
  try {
    assert.equal(await drainWorker(root, 'pyworker'), false);
    assert.equal(await drainWorker(root, 'queue'), true);
    assert.equal(completed, true, 'Acknowledgement must follow completion of active work');
  } finally { close(); }
});
