import { constants } from 'node:fs';
import { copyFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { findEnvTemplates } from './lib/env-templates.mjs';
import { ROOT, logStatus, main } from './lib/runtime.mjs';

export async function copyEnvExamples(root, log = logStatus) {
  const templates = await findEnvTemplates(root, name => /^\.env(?:\.[^.]+)*\.example$/.test(name));
  for (const template of templates) {
    const file = template.slice(0, -'.example'.length);
    const target = path.join(root, file);
    try {
      await copyFile(path.join(root, template), target, constants.COPYFILE_EXCL);
      log(`[ok] ${template} -> ${file}`);
    } catch (error) {
      if (error.code !== 'EEXIST' || !(await lstat(target)).isFile()) throw error;
      log(`[skip] ${file} already exists`);
    }
  }
}

main(import.meta.url, () => copyEnvExamples(ROOT));
