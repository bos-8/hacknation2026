import "server-only";
import { cache } from "react";
import { getAccess, requireAccess } from "./access.ts";
import { ADMIN_ACCESS } from "../../schemas/access.ts";

// Deduplicate only within this server render; never cache role decisions across requests.
export const getAdminAccess = cache(async () => {
  const decision = await getAccess(ADMIN_ACCESS);
  return decision.status;
});

/** Reuse before every admin data read, Server Action and Route Handler. Layout alone is insufficient. */
export async function requireAdminAccess() {
  await requireAccess(ADMIN_ACCESS);
}
