"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { API_ROUTES } from "@/config/api-routes";
import type { ImageOcrResult } from "@/schemas/image-ocr";
import { Button, Heading, Throbber } from "@/ui/basic";
import { recognizePhoto } from "./image-actions";

function PhotoPreview({ src, name }: { src: string; name: string }) {
  const t = useTranslations("common.imageOcr");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  return <section className="min-w-0 overflow-hidden rounded-lg border border-panel-border bg-panel">
    <div className="flex items-center justify-between gap-3 border-b border-panel-border p-3">
      <Heading className="text-lg">{t("original")}</Heading>
      <a href={src} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">{t("openOriginal")}</a>
    </div>
    <div className="relative flex min-h-48 items-center justify-center p-3">
      {state === "loading" && <div className="absolute inset-0 flex items-center justify-center"><Throbber label={t("loadingImage")} /></div>}
      {state === "error" ? <div className="space-y-3 p-3"><p role="alert">{t("imageFailed")}</p>
        <Button onClick={() => { setState("loading"); setAttempt(value => value + 1); }}>{t("retryImage")}</Button></div>
        // eslint-disable-next-line @next/next/no-img-element
        : <img key={attempt} src={`${src}&attempt=${attempt}`} alt={name} onLoad={() => setState("ready")}
          onError={() => setState("error")} className={`block max-h-[70vh] max-w-full object-contain ${state === "loading" ? "opacity-0" : ""}`} />}
    </div>
  </section>;
}

export function ImageReview({ file, version, name, uploadedAt, initialResult }: {
  file: string; version: number; name: string; uploadedAt: string; initialResult: ImageOcrResult | null;
}) {
  const t = useTranslations("common.imageOcr");
  const format = useFormatter();
  const [result, setResult] = useState(initialResult?.status === "ok" ? initialResult : null);
  const [error, setError] = useState<Exclude<ImageOcrResult["status"], "ok"> | null>(null);
  const [pending, start] = useTransition();
  const src = `${API_ROUTES.fileDownload.replace("{uuid}", file)}?version=${version}&preview=1`;
  function recognize() {
    start(async () => {
      setError(null);
      try {
        const next = await recognizePhoto(file, version);
        if (next.status === "ok") setResult(next);
        else setError(next.status);
      } catch { setError("unavailable"); }
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
      <PhotoPreview src={src} name={name} />
      <div className="min-w-0 space-y-3 rounded-lg border border-panel-border bg-panel p-4" aria-busy={pending}>
        <Heading>{t("text")}</Heading>
        {pending && <Throbber label={t("working")} />}
        {result?.status === "ok" && <>
          <p className="text-sm text-muted-foreground">{t("model")}: {result.model}</p>
          <div className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words" role="status">{result.text || t("empty")}</div>
        </>}
        {error && <p role="alert" className="text-error">{t(`errors.${error}`)}</p>}
        {!pending && !result && !error && <p className="text-muted-foreground">{t("waiting")}</p>}
      </div>
    </div>
  </section>;
}
