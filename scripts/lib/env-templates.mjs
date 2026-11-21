import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { safePath } from './runtime.mjs';

const SKIP_DIRS = new Set(['.git', '.ai', '.agents', '.codex', '.vscode', 'node_modules', '.pnpm-store',
  '.next', 'dist', 'build', 'out', 'coverage', '.turbo', '.cache', '.venv', 'venv', '__pycache__',
  '.pytest_cache', '.ruff_cache', '.mypy_cache', '.uv-cache', '.terraform', 'data', 'backups', 'secrets', 'certs',
  'var', '.local', '.work', '.tools', 'bin', 'obj', 'target']);

export async function findEnvTemplates(root, matches, relative = '') {
  const found = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const file = path.join(relative, entry.name).split(path.sep).join('/');
    if (entry.isSymbolicLink()) continue;
    if (entry.isFile() && matches(entry.name)) found.push(file);
    else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && await safePath(root, file)) {
      found.push(...await findEnvTemplates(root, matches, file));
    }
  }
  return found.sort();
}
