import { connection } from "next/server";
import { API_ROUTES, API_VERSION } from "@/config/api-routes";
import { APP_VERSION } from "@/config/version";
import { jsonNoStore } from "@/server/http";

export async function GET() {
  await connection();
  return jsonNoStore({
    service: "web",
    apiVersion: API_VERSION,
    version: APP_VERSION,
    endpoints: API_ROUTES,
  });
}
