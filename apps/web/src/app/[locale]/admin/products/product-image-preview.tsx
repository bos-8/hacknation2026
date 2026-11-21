"use client";

import { API_ROUTES } from "@/config/api-routes";
import { ImagePreviewDropdown } from "@/ui/components/image-preview-dropdown";

export function ProductImagePreview({ uuid, name, updatedAt }: { uuid: string; name: string; updatedAt: Date }) {
  return <ImagePreviewDropdown key={`${uuid}:${updatedAt.toISOString()}`} imageUrl={API_ROUTES.productImage.replace("{uuid}", encodeURIComponent(uuid))} name={name} />;
}
