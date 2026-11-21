import { API_ROUTES } from "@/config/api-routes";
import { connection } from "next/server";
import { getAuth } from "@/server/auth/auth";
import { getAuthConfig } from "@/server/auth/config";
import { sessionView } from "@/server/auth/session-view";
import { jsonNoStore } from "@/server/http";

async function handle(request: Request) {
  await connection();
  const path = new URL(request.url).pathname;
  const callback = request.method === "GET" && path === `${API_ROUTES.auth}/callback/keycloak`;
  const unavailable = () => new Response(null, { status: 303,
    headers: { Location: "/pl?auth=unavailable", "Cache-Control": "no-store" } });
  const allowed = request.method === "GET"
    ? [`${API_ROUTES.auth}/callback/keycloak`, `${API_ROUTES.auth}/get-session`, API_ROUTES.session.status]
    : [`${API_ROUTES.auth}/sign-in/social`, `${API_ROUTES.auth}/sign-out`, API_ROUTES.session.logout, API_ROUTES.session.renew];
  if (!allowed.includes(path)) return jsonNoStore({ error: "Not found" }, 404);
  try {
    if (request.method === "POST" && request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) {
      return jsonNoStore({ error: "Forbidden origin" }, 403);
    }
    if (request.method === "GET" && path === `${API_ROUTES.auth}/get-session`) {
      return jsonNoStore(sessionView(await getAuth().api.getSession({ headers: request.headers })));
    }
    let authRequest = request;
    if (path === `${API_ROUTES.auth}/sign-out`) {
      const url = new URL(request.url); url.pathname = API_ROUTES.session.logout;
      authRequest = new Request(url, { method: "POST", headers: request.headers, body: await request.text() });
    }
    const response = await getAuth().handler(authRequest);
    if (callback && response.status >= 400) return unavailable();
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return callback ? unavailable() : jsonNoStore({ error: "Authentication unavailable" }, 503);
  }
}

export { handle as GET, handle as POST };
