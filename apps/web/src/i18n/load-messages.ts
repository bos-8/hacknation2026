import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { validateMessages, type MessageFiles, type MessageTree } from "./message-schema.ts";

async function discover(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`${prefix}${entry.name}: linked message paths are not supported`);
    if (entry.isDirectory()) files.push(...await discover(path.join(directory, entry.name), `${prefix}${entry.name}/`));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(prefix + entry.name);
  }
  return files.sort();
}

/** Discover catalogs for filesystem validation tools and tests. Rendering uses static imports. */
export async function loadMessages(directory: string, locales: readonly string[]): Promise<Record<string, MessageTree>> {
  const catalogs: MessageFiles = {};
  for (const locale of locales) {
    if (!/^[a-z]{2}(?:-[A-Za-z0-9]+)*$/.test(locale)) throw new Error("Invalid locale");
    const files = await discover(path.join(directory, locale));
    const catalog: Record<string, unknown> = {};
    for (const file of files) {
      try { catalog[file] = JSON.parse(await readFile(path.join(directory, locale, file), "utf8")); }
      catch { throw new Error(`${locale}/${file}: cannot read valid message JSON`); }
    }
    catalogs[locale] = catalog;
  }
  return validateMessages(catalogs, locales);
}
