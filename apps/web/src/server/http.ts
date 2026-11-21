import "server-only";

/** Operational responses must not be reused by browsers or intermediary caches. */
export function jsonNoStore(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
