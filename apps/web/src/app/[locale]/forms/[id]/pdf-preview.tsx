"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Button, Throbber } from "@/ui/basic";

export function PdfPreview({ src, name, page, onPage, children }: {
  src: string;
  name: string;
  page: number;
  onPage: (page: number) => void;
  children: ReactNode;
}) {
  const t = useTranslations("forms");
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [rendered, setRendered] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [failedPage, setFailedPage] = useState(0);
  const current = Math.max(1, Math.min(page, document?.numPages ?? 1));

  useEffect(() => {
    let stopped = false;
    let task: PDFDocumentLoadingTask | undefined;
    void (async () => {
      try {
        const pdf = await import("pdfjs-dist");
        if (stopped) return;
        pdf.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url,
        ).toString();
        task = pdf.getDocument({ url: src, enableXfa: false });
        const result = await task.promise;
        if (!stopped) setDocument(result);
      } catch {
        if (!stopped) setLoadFailed(true);
      }
    })();
    return () => {
      stopped = true;
      void task?.destroy().catch(() => undefined);
    };
  }, [src]);

  useEffect(() => {
    const surface = canvas.current;
    if (!document || !surface) return;
    let stopped = false;
    let task: RenderTask | undefined;
    void (async () => {
      try {
        const source = await document.getPage(current);
        if (stopped) return;
        const size = source.getViewport({ scale: 1 });
        const viewport = source.getViewport({ scale: Math.min(2.4, 1800 / Math.max(size.width, size.height)) });
        surface.width = Math.ceil(viewport.width);
        surface.height = Math.ceil(viewport.height);
        task = source.render({ canvas: surface, viewport });
        await task.promise;
        if (!stopped) setRendered(current);
      } catch {
        if (!stopped) setFailedPage(current);
      }
    })();
    return () => {
      stopped = true;
      task?.cancel();
    };
  }, [document, current]);

  if (loadFailed || failedPage === current) return <div className="space-y-2 p-4 text-sm">
    <p role="status">{t("pdfPreviewFailed")}</p>
    <a href={src} className="text-accent underline" target="_blank" rel="noreferrer">{t("original")}</a>
  </div>;

  return <div className="space-y-2 p-3">
    {document && <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <Button size="sm" disabled={current === 1} onClick={() => onPage(current - 1)}>{t("previousPdfPage")}</Button>
      <span className="tabular-nums" aria-live="polite">{t("pdfPage", { page: current, total: document.numPages })}</span>
      <Button size="sm" disabled={current === document.numPages} onClick={() => onPage(current + 1)}>{t("nextPdfPage")}</Button>
    </div>}
    {(!document || rendered !== current) && <div className="flex min-h-24 items-center justify-center"><Throbber /></div>}
    <div className="flex justify-center">
      <div className="relative max-w-full">
        <canvas ref={canvas} key={current} role="img"
          aria-label={`${name} · ${current}`} className={`block max-h-[70vh] max-w-full ${rendered === current ? "" : "hidden"}`} />
        {rendered === current && children}
      </div>
    </div>
  </div>;
}
