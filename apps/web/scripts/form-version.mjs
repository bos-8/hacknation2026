import { createHash } from "node:crypto";

export function resultVersion(result) {
  return createHash("sha256").update(JSON.stringify(result)).digest("hex");
}
