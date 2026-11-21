import { connection } from "next/server";
import { API_ROUTES, API_VERSION } from "@/config/api-routes";
import { jsonNoStore } from "@/server/http";

/** Public API discovery only; business endpoints enforce their own authorization. */
export async function GET() {
  await connection();
  return jsonNoStore({
    service: "web",
    defaultVersion: API_VERSION,
    versions: { [API_VERSION]: API_ROUTES.root },
  });
}
