"use client";

import { useTranslations } from "next-intl";
import { AsideSection } from "./aside-section";
import { PrivateImagePreview } from "./private-image-preview";

export function ImagePreviewDropdown({ imageUrl, name, defaultOpen = false }: { imageUrl: string; name: string; defaultOpen?: boolean }) {
  const t = useTranslations("common.admin.files");
  return <AsideSection title={t("imagePreview")} defaultOpen={defaultOpen}>
    <PrivateImagePreview imageUrl={imageUrl} name={name} />
  </AsideSection>;
}
