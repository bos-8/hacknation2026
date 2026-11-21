import type { z } from "zod";

/** Configuration diagnostics contain distinct field names only, never values or Zod error causes. */
export function parseConfig<T extends z.ZodType>(schema: T, values: unknown, label: string): z.output<T> {
  const result = schema.safeParse(values);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join(".") || "root"))];
    throw new Error(`Invalid ${label} configuration: ${fields.join(", ")}`);
  }
  return result.data;
}
