import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function formatStatus(message, { env = process.env, isTTY = process.stdout.isTTY } = {}) {
  if (Object.hasOwn(env, 'NO_COLOR') || env.FORCE_COLOR === '0' || (!isTTY && !env.FORCE_COLOR)) return message;
  const colors = { ok: 32, success: 32, warn: 33, error: 31, busy: 31, skip: 90, info: 36, preview: 36, clean: 36 };
  return message.replace(/^\[(\w+)\]/, (tag, status) => colors[status]
    ? `\x1b[${colors[status]}m${tag}\x1b[0m` : tag);
}

export function logStatus(message) {
  console.log(formatStatus(message));
}

export function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

// Reject junctions and symlinks in every existing path component, including the target.
export async function safePath(root, target) {
  root = await realpath(root);
  target = path.resolve(root, target);
  if (!inside(root, target)) throw new Error('Path must stay below the workspace root.');
  let current = root;
  for (const part of path.relative(root, target).split(path.sep)) {
    current = path.join(current, part);
    let stats;
    try { stats = await lstat(current); } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (stats.isSymbolicLink()) throw new Error(`Refusing linked path: ${path.relative(root, current)}`);
    if (!inside(root, await realpath(current))) throw new Error('Resolved path escapes the workspace.');
  }
  return target;
}

// Check structure before using Node's dotenv parser. Never include values in diagnostics.
export function parseEnvironment(text, label) {
  const keys = new Set();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!match) throw new Error(`${label}:${index + 1}: invalid assignment (value hidden).`);
    const [, key, raw] = match;
    if (keys.has(key)) throw new Error(`${label}:${index + 1}: duplicate variable ${key}.`);
    keys.add(key);
    const value = raw.trimStart();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      let rest = value.slice(1);
      while (!rest.includes(quote)) {
        index++;
        if (index >= lines.length) throw new Error(`${label}: unterminated quoted value for ${key}.`);
        rest += `\n${lines[index]}`;
      }
      if (!/^\s*(?:#.*)?$/.test(rest.slice(rest.indexOf(quote) + 1))) {
        throw new Error(`${label}:${index + 1}: invalid trailing content for ${key} (value hidden).`);
      }
    }
  }
  const values = parseEnv(text);
  if (Object.keys(values).length !== keys.size) throw new Error(`${label}: unsupported env syntax (values hidden).`);
  return values;
}

export async function readEnvironment(root, relative) {
  const target = await safePath(root, relative);
  if (!target) throw new Error(`Missing env file: ${relative}`);
  return parseEnvironment(await readFile(target, 'utf8'), relative);
}

export function main(url, action) {
  if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === url) {
    action().catch((error) => {
      console.error(formatStatus(`[error] ${error.message}`, { isTTY: process.stderr.isTTY }));
      process.exitCode = 1;
    });
  }
}
