import { fileDownloadResponse } from "@/server/file-download";

export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const query = new URL(request.url).searchParams;
  return fileDownloadResponse(uuid, query.get("version"), query.get("preview") === "1");
}
