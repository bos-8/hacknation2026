import { connection } from "next/server";
import { getLiveness } from "@/server/health";
import { jsonNoStore } from "@/server/http";

export async function GET() {
  await connection();
  return jsonNoStore(getLiveness());
}
