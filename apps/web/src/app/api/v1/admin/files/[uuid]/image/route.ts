import { fileImageResponse } from "@/server/file-image";

export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  return fileImageResponse(uuid, new URL(request.url).searchParams.get("version"));
}
