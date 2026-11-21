import { connection } from "next/server";
import { getReadiness } from "@/server/health";
import { jsonNoStore } from "@/server/http";

export async function GET() {
  await connection();
  const readiness = getReadiness();
  return jsonNoStore(readiness, readiness.status === "ok" ? 200 : 503);
}
