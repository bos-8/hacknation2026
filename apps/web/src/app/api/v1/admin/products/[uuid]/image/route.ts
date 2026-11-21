import { productImageResponse } from "@/server/product-image";

export async function GET(_request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  return productImageResponse(uuid);
}
