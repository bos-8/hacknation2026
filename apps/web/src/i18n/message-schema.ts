import "server-only";

export type MessageTree = { [key: string]: string | MessageTree };
export type MessageFiles = Record<string, Record<string, unknown>>;

function keys(value: unknown, file: string, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${file}: expected a message object at ${prefix || "root"}`);
  }
  return Object.entries(value).flatMap(([key, child]) => {
    if (!key || key.includes(".") || ["__proto__", "constructor", "prototype"].includes(key)) {
      throw new Error(`${file}: invalid message key ${key}`);
    }
    const full = prefix ? `${prefix}.${key}` : key;
    return typeof child === "string" ? [full] : keys(child, file, full);
  }).sort();
}

/** Validate and merge explicitly registered catalogs without runtime file IO. */
export function validateMessages(catalogs: MessageFiles, locales: readonly string[]): Record<string, MessageTree> {
  const messages: Record<string, MessageTree> = {};
  let referenceFiles: string | undefined;
  const referenceKeys = new Map<string, string>();
  for (const locale of locales) {
    if (!/^[a-z]{2}(?:-[A-Za-z0-9]+)*$/.test(locale)) throw new Error("Invalid locale");
    const catalog = catalogs[locale];
    if (!catalog) throw new Error(`${locale}: missing message catalog`);
    const files = Object.keys(catalog).sort();
    if (!files.includes("common.json") || !files.includes("home.json")) throw new Error(`${locale}: common.json and home.json are required`);
    if (referenceFiles && JSON.stringify(files) !== referenceFiles) throw new Error(`${locale}: message files differ from ${locales[0]}`);
    referenceFiles = JSON.stringify(files);
    const merged: MessageTree = {};
    for (const file of files) {
      const value = catalog[file];
      const keyList = JSON.stringify(keys(value, `${locale}/${file}`));
      if (referenceKeys.has(file) && referenceKeys.get(file) !== keyList) {
        throw new Error(`${locale}/${file}: translation keys differ from ${locales[0]}`);
      }
      referenceKeys.set(file, keyList);
      for (const [namespace, content] of Object.entries(value as MessageTree)) {
        if (Object.hasOwn(merged, namespace)) throw new Error(`${locale}/${file}: duplicate namespace ${namespace}`);
        merged[namespace] = content;
      }
    }
    messages[locale] = merged;
  }
  return messages;
}
