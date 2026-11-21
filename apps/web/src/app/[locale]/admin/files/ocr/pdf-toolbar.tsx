"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Download, FileEarmarkPdf, SquareFill, Tags } from "react-bootstrap-icons";
import { API_ROUTES } from "@/config/api-routes";
import type { RunView, Variant } from "@/schemas/document-review";
import { Button } from "@/ui/basic";
import { basicStyles, buttonSizes, buttonTones, cx } from "@/ui/basic/styles";
import { tableStyles } from "@/ui/components/styles";
import { requestPdf } from "./actions";
import { StageProgress } from "./stage-progress";

const variants = ["original", "black", "labels"] as const;
const icons = { original: FileEarmarkPdf, black: SquareFill, labels: Tags };

export function PdfToolbar({ run, onChange, disabled = false }: {
  disabled?: boolean; run?: Pick<RunView, "uuid" | "revision" | "exports" | "stage"> | null; onChange: () => void;
}) {
  const t = useTranslations("common.documentReview");
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  function generate(variant: Variant) {
    if (!run) return;
    start(async () => {
      try {
        const result = await requestPdf(run.uuid, run.revision, variant);
        setError(result.status !== "ok");
        if (result.status === "ok") window.dispatchEvent(new CustomEvent("document-activity", { detail: result.activityId }));
        onChange();
      } catch { setError(true); }
    });
  }
  const originalAllowed = run && ["ocr_review", "review", "approved"].includes(run.stage);
  const queued = run?.exports.filter(job => job.stage === "queued") ?? [];
  return <section aria-label={t("exportPdf")} className="rounded-lg border border-border bg-card shadow-sm">
    <div className={cx(tableStyles.toolbar, "flex-wrap py-2")}>
      <h3 className="text-sm font-semibold">{t("exportPdf")}</h3>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {variants.map(variant => {
          const item = run?.exports.find(job => job.variant === variant);
          if (item?.stage === "ready" && !disabled) return <a key={variant} download
            className={cx(basicStyles.button, buttonSizes.sm, buttonTones["main-outline"])}
            href={API_ROUTES.fileDownload.replace("{uuid}", item.uuid) + "?version=1"}>
            <Download aria-hidden="true" />{t("download")} · {t(variant)}
          </a>;
          const allowed = variant === "original" ? originalAllowed : run?.stage === "approved";
          const Icon = icons[variant];
          return <Button key={variant} size="sm" tone="main-outline" disabled={disabled || !allowed || pending || item?.stage === "queued"}
            tooltip={t(disabled ? "saveBeforeExport" : item?.stage === "queued" ? "queued" : allowed ? "generatePdf" : variant === "original" ? "needsOcr" : "needsApproval")}
            onClick={() => generate(variant)}>
            <Icon aria-hidden="true" />{t(variant)}{item?.stage === "failed" && ` · ${t("retry")}`}
          </Button>;
        })}
      </div>
    </div>
    {(disabled || run?.stage !== "approved") && <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
      {t(disabled ? "saveBeforeExport" : originalAllowed ? "needsApproval" : "exportAvailability")}
    </p>}
    {queued.map(job => <div key={job.uuid} className="border-t border-border px-3 py-2">
      <StageProgress label={t("exportStatus", { variant: t(job.variant), state: t("queued") })} percent={job.progress} timing={job} />
    </div>)}
    {error && <p role="alert" className="px-3 pb-2 text-sm text-error">{t("error")}</p>}
  </section>;
}
