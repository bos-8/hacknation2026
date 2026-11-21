import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";
import { getAuth } from "./auth.ts";

/** Request-local memoization only; never persist authenticated output in Next.js caches. */
export const getSession = cache(async () => {
  // Signature checks and expiring identity tokens must run after a real request exists.
  await connection();
  return getAuth().api.getSession({ headers: await headers() });
});
