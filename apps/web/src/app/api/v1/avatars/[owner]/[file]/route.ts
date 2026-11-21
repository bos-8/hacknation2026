import { getAvatarService } from "@/server/avatars";
import { connection } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ owner: string; file: string }> }) {
  await connection();
  const { owner, file } = await params;
  return getAvatarService().read(owner, file);
}
