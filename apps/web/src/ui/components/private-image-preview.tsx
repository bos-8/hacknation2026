"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Button, Throbber } from "@/ui/basic";
import { productFormStyles } from "@/ui/components/styles";

export function PrivateImagePreview({ imageUrl, name }: { imageUrl: string; name: string }) {
  return <ImagePreview key={imageUrl} imageUrl={imageUrl} name={name} />;
}

function ImagePreview({ imageUrl, name }: { imageUrl: string; name: string }) {
  const t = useTranslations("common.admin.files");
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [unsupported, setUnsupported] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function load() {
      try {
        const response = await fetch(imageUrl, { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
        if (controller.signal.aborted) return;
        if (response.status === 415) { setUnsupported(true); return; }
        if (!response.ok || response.headers.get("content-type") !== "image/webp") throw new Error("Image unavailable");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl); setFailed(false);
      } catch { if (!controller.signal.aborted) setFailed(true); }
    }
    void load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [imageUrl, attempt]);
  if (unsupported) return <p role="status">{t("imageUnsupported")}</p>;
  if (failed) return <div className="space-y-2"><p role="alert" className="text-error">{t("imageLoadFailed")}</p>
    <Button size="sm" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>{t("retry")}</Button></div>;
  return src ? <Image src={src} alt={t("imageFor", { name })} width={460} height={320} unoptimized className={productFormStyles.preview} />
    : <div className="flex min-h-36 items-center justify-center"><Throbber label={t("loadingImage")} /></div>;
}
