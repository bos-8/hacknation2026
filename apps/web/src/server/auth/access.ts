import "server-only";
import { cache } from "react";
import { forbidden, unauthorized } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "./session.ts";
import { getIdentityDirectory } from "./directory.ts";
import { evaluateAccess, type AccessContext } from "./access-policy.ts";
import type { AccessPolicy } from "../../schemas/access.ts";

// Request-local only: a new action always reads current assignments from Keycloak.
const readRoles = cache((uuid: string) => getIdentityDirectory().rolesByUuid?.(uuid) ?? Promise.resolve(null));

export async function getAccess(policy: AccessPolicy) {
  // evaluateAccess handles real auth failures, never Next's prerender control flow.
  await connection();
  return evaluateAccess(policy, { readSession: getSession,
    readRoles });
}

/** Layouts and every server entry point use the same explicit policy. */
export async function requireAccess(policy: AccessPolicy): Promise<AccessContext> {
  const decision = await getAccess(policy);
  if (decision.status === "unauthenticated") unauthorized();
  if (decision.status !== "allowed") forbidden();
  return decision.context;
}

export async function withAccess<T>(policy: AccessPolicy, action: (context: AccessContext) => Promise<T>): Promise<T | { status: "denied" }> {
  const decision = await getAccess(policy);
  if (decision.status !== "allowed") return { status: "denied" };
  return action(decision.context);
}
