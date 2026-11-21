import { readdir, lstat, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { clearLine, cursorTo } from 'node:readline';
import { ROOT, safePath, main, logStatus } from './lib/runtime.mjs';

export async function withSpinner(message, action, { stream = process.stdout } = {}) {
  if (!stream.isTTY) return action();
  const frames = ['|', '/', '-', '\\'];
  let frame = 0;
  const render = () => {
    cursorTo(stream, 0);
    clearLine(stream, 0);
    stream.write(`${frames[frame++ % frames.length]} ${message}`);
  };
  render();
  const timer = setInterval(render, 80);
  try {
    return await action();
  } finally {
    clearInterval(timer);
    cursorTo(stream, 0);
    clearLine(stream, 0);
  }
}

export async function clean(root, { dryRun = false, dependencies = true, log = logStatus } = {}) {
  root = await realpath(root);
  const owners = ['.'];
  for (const folder of ['apps', 'packages']) {
    const parent = await safePath(root, folder);
    if (!parent) continue;
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) owners.push(path.join(folder, entry.name));
    }
  }
  const names = ['dist', 'build', '.next', 'out', 'coverage', '.turbo'];
  if (dependencies) names.push('node_modules');
  let count = 0;
  async function removeOutput(relative, directory) {
    const target = await safePath(root, relative);
    if (!target) return;
    const stats = await lstat(target);
    if (directory ? !stats.isDirectory() : !stats.isFile()) {
      throw new Error(`Expected a ${directory ? 'directory' : 'file'}: ${relative}`);
    }
    if (dryRun) {
      log(`[preview] ${relative}`);
    } else {
      log(`[clean] Deleting ${relative}...`);
      await withSpinner(`Deleting ${relative}...`, async () => {
        // Recheck immediately before deletion, using one runtime throughout.
        const verified = await safePath(root, relative);
        if (verified !== target) throw new Error(`Cleanup target changed: ${relative}`);
        await rm(verified, { recursive: directory, force: false, maxRetries: 2 });
      }, { stream: log === logStatus ? process.stdout : { isTTY: false } });
      log(`[success] deleted files: ${relative}`);
    }
    count++;
  }
  // Fixed output names at package roots only. No recursive scan of source or infrastructure data.
  for (const owner of owners) {
    for (const name of names) {
      await removeOutput(path.join(owner, name), true);
    }
    const directory = owner === '.' ? root : await safePath(root, owner);
    if (!directory) continue;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.eslintcache' || entry.name.endsWith('.tsbuildinfo')) {
        await removeOutput(path.join(owner, entry.name), false);
      }
    }
  }
  log(dryRun ? `[preview] ${count} generated paths selected, nothing deleted.`
    : `[success] deleted files from ${count} generated ${count === 1 ? 'path' : 'paths'}.`);
  return count;
}

main(import.meta.url, async () => {
  const { values } = parseArgs({ options: {
    'dry-run': { type: 'boolean' }, dependencies: { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: pnpm clean [--dry-run]\nRemoves node_modules, build outputs, *.tsbuildinfo and .eslintcache at workspace/package roots. --dependencies is accepted for compatibility. Preserves source, lockfile, env, venv, certificates and data.');
    return;
  }
  await clean(ROOT, { dryRun: values['dry-run'], dependencies: values.dependencies });
});
