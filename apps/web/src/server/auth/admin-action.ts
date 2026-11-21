import "server-only";
import { withAccess } from "./access.ts";
import { ADMIN_ACCESS } from "../../schemas/access.ts";

/** Application wrapper around Better Auth and Keycloak roles; evaluated per request. */
export async function withAdminSession<T>(action: (actorUuid: string) => Promise<T>): Promise<T | { status: "denied" }> {
  return withAccess<T | { status: "denied" }>(ADMIN_ACCESS, context => context.actorUuid ? action(context.actorUuid) : Promise.resolve({ status: "denied" as const }));
}
