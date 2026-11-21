import { parseArgs } from 'node:util';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, readEnvironment, safePath, main, logStatus } from './lib/runtime.mjs';

const TEMPLATE_NAMES = {
  dev: new Set(['.env.example', '.env.dev.example']),
  qa: new Set(['.env.qa.example']),
  prod: new Set(['.env.prod.example']),
};
const SKIP_DIRS = new Set(['.git', '.ai', '.agents', '.codex', '.vscode', 'node_modules', '.pnpm-store',
  '.next', 'dist', 'build', 'out', 'coverage', '.turbo', '.cache', '.venv', 'venv', '__pycache__',
  '.pytest_cache', '.ruff_cache', '.mypy_cache', '.uv-cache', '.terraform', 'data', 'backups', 'secrets', 'certs',
  'var', '.local', '.work', '.tools', 'bin', 'obj', 'target']);

async function findTemplates(root, mode, relative = '') {
  const found = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const file = path.join(relative, entry.name).split(path.sep).join('/');
    if (entry.isSymbolicLink()) continue;
    if (entry.isFile() && TEMPLATE_NAMES[mode].has(entry.name)) found.push(file);
    else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && await safePath(root, file)) {
      found.push(...await findTemplates(root, mode, file));
    }
  }
  return found.sort();
}

export async function validateEnvironment(root, { mode = 'dev', templatesOnly = false,
  requireValues = false, log = logStatus } = {}) {
  if (!Object.hasOwn(TEMPLATE_NAMES, mode)) throw new Error('Mode must be dev, qa or prod.');
  let failures = 0;
  let checked = 0;
  const templates = await findTemplates(root, mode);
  log(`[info] Scanning workspace: ${path.resolve(root)} (mode: ${mode}).`);
  if (!templates.length) {
    log(`[warn] No ${[...TEMPLATE_NAMES[mode]].join(' or ')} templates found in ${path.resolve(root)}. Nothing to validate.`);
    return;
  }
  for (const template of templates) {
    const file = template.slice(0, -'.example'.length);
    try {
      const expected = await readEnvironment(root, template);
      if (!templatesOnly) {
        if (!await safePath(root, file)) throw new Error(`Missing env file: ${file}. Required by: ${template}`);
        const actual = await readEnvironment(root, file);
        const missing = Object.keys(expected).filter((key) => !Object.hasOwn(actual, key));
        const empty = Object.keys(expected).filter((key) => expected[key] !== '' && Object.hasOwn(actual, key) && actual[key].trim() === '');
        const extra = Object.keys(actual).filter((key) => !Object.hasOwn(expected, key));
        let invalid = false;
        if (missing.length) {
          log(`[error] ${file}: missing variables ${missing.join(', ')}. Expected from: ${template}`);
          invalid = true;
        }
        if (empty.length) {
          log(`[${requireValues ? 'error' : 'warn'}] ${file}: empty variables ${empty.join(', ')}. Template: ${template}`);
          if (requireValues) invalid = true;
        }
        if (extra.length) log(`[warn] ${file}: undocumented variables ${extra.join(', ')}. Not present in: ${template}`);
        if (invalid) { failures++; continue; }
      }
      log(`[ok] ${file}${templatesOnly ? '.example' : ''}`);
      checked++;
    } catch (error) {
      log(`[error] ${error.message}`);
      failures++;
    }
  }
  if (failures) throw new Error(`Env validation failed for ${failures} file pair(s). No values were printed.`);
  log(`[ok] ${checked} env template(s) validated. Credentials and service connectivity were not checked.`);
}

main(import.meta.url, async () => {
  const { values } = parseArgs({ options: { mode: { type: 'string', default: 'dev' },
    'templates-only': { type: 'boolean' }, 'require-values': { type: 'boolean' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('Usage: pnpm validate:env [--mode dev|qa|prod] [--templates-only] [--require-values]\nScans the workspace for existing templates, excluding dependencies, generated files, data and linked paths. DEV: .env.example and .env.dev.example. QA: .env.qa.example. PROD: .env.prod.example. Each template requires its matching env file and variables, unless --templates-only is used. No templates means nothing to validate.');
    return;
  }
  await validateEnvironment(ROOT, { mode: values.mode, templatesOnly: values['templates-only'],
    requireValues: values['require-values'] });
});
