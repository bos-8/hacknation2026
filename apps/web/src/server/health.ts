import "server-only";
import { getServerConfig } from "../config/server.ts";

export function getLiveness() {
  return { status: "ok", service: "web", check: "liveness" } as const;
}

/** Configuration only until real application dependencies are integrated. */
export function getReadiness(values: unknown = process.env) {
  try {
    getServerConfig(values);
    return {
      status: "ok", service: "web", check: "readiness", checks: { configuration: "up" },
    } as const;
  } catch {
    // Never publish environment values or internal validation details.
    return {
      status: "error", service: "web", check: "readiness", checks: { configuration: "down" },
    } as const;
  }
}
