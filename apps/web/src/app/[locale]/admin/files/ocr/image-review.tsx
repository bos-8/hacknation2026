"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { API_ROUTES } from "@/config/api-routes";
import type { ImageOcrResult } from "@/schemas/image-ocr";
import { Button, Heading, Throbber } from "@/ui/basic";
import { OriginalDocument } from "./original-document";
import { recognizePhoto } from "./image-actions";

export function ImageReview({ file, version, name, uploadedAt }: {
  file: string; version: number; name: string; uploadedAt: string;
}) {
  const t = useTranslations("common.imageOcr");
  const format = useFormatter();
  const [result, setResult] = useState<ImageOcrResult | null>(null);
  const [pending, start] = useTransition();
  const src = `${API_ROUTES.fileDownload.replace("{uuid}", file)}?version=${version}&preview=1`;
  function recognize() {
    start(async () => {
      setResult(null);
      try { setResult(await recognizePhoto(file, version)); }
      catch { setResult({ status: "unavailable" }); }
    });
  }
  return <section className="space-y-5">
    <div className="space-y-2">
      <Heading level={1}>{t("title")}</Heading>
      <p className="break-words">{name}</p>
      <p>{t("uploadedAt")}: <time dateTime={uploadedAt}>{format.dateTime(new Date(uploadedAt), { dateStyle: "medium", timeStyle: "medium" })}</time></p>
      <Button disabled={pending} onClick={recognize}>{t(pending ? "working" : "start")}</Button>
      <p className="text-sm text-muted-foreground">{t("providerNotice")}</p>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-lg border border-border p-3"><OriginalDocument name={name} src={src} /></div>
      <div className="min-w-0 space-y-3 rounded-lg border border-border p-4" aria-busy={pending}>
        <Heading>{t("text")}</Heading>
        {pending && <Throbber label={t("working")} />}
        {result?.status === "ok" && <>
          <p className="text-sm text-muted-foreground">{t("model")}: {result.model}</p>
          <div className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words" role="status">{result.text || t("empty")}</div>
        </>}
        {result && result.status !== "ok" && <p role="alert">{t(`errors.${result.status}`)}</p>}
        {!pending && !result && <p className="text-muted-foreground">{t("waiting")}</p>}
      </div>
    </div>
  </section>;
}
