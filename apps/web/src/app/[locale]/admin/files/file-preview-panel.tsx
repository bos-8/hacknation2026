"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { API_ROUTES } from "@/config/api-routes";
import { Button, Throbber } from "@/ui/basic";
import { PushAside } from "@/ui/components/aside";
import { ImagePreviewDropdown } from "@/ui/components/image-preview-dropdown";
import { AsideSection } from "@/ui/components/aside-section";
import { readFilePreview } from "./actions";
import { FileSummary } from "./file-summary";
import { ChangeHistory } from "@/ui/components/change-history";

function FilePreviewAside({ uuid, showImage }: { uuid: string; showImage: boolean }) {
  const t = useTranslations("common.admin.files");
  const format = useFormatter();
  const [result, setResult] = useState<Awaited<ReturnType<typeof readFilePreview>> | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void readFilePreview(uuid).catch(() => ({ status: "failed" as const })).then(next => { if (!cancelled) setResult(next); });
    return () => { cancelled = true; };
  }, [uuid, attempt]);
  function close() {
    const url = new URL(window.location.href);
    url.searchParams.delete("file");
    url.searchParams.delete("preview");
    window.history.replaceState(null, "", url);
  }
  const file = result?.status === "ok" ? result.file : null;
  const date = (value: Date) => format.dateTime(value, { dateStyle: "medium", timeStyle: "short" });
  return <PushAside open onClose={close} title={file?.name ?? t("filePreview")} defaultWidth={460}>
    {!result ? <div className="flex min-h-36 items-center justify-center"><Throbber label={t("loadingData")} /></div>
      : !file ? <div className="space-y-2"><p role="alert" className="text-error">{t(result.status === "denied" ? "refreshDenied" : result.status === "notFound" ? "fileNotFound" : "previewFailed")}</p>
        <Button size="sm" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>{t("retry")}</Button></div>
      : <>
        <ImagePreviewDropdown imageUrl={API_ROUTES.fileImage.replace("{uuid}", encodeURIComponent(uuid))} name={file.name} defaultOpen={showImage} />
        <FileSummary file={file} />
        <AsideSection title={t("additionalInfo")}><dl className="space-y-3">{[
          { label: t("fileId"), value: file.details?.uuid },
          { label: t("objectId"), value: file.key },
          { label: t("status"), value: file.details ? t(`statuses.${file.details.status}`) : "—" },
          { label: t("size"), value: format.number(file.size, { style: "unit", unit: "byte" }) },
          { label: t("modifiedAt"), value: date(file.modifiedAt) },
          { label: t("createdAt"), value: file.details ? date(file.details.createdAt) : "—" },
          { label: t("createdBy"), value: file.details?.createdByUuid }, { label: t("updatedBy"), value: file.details?.updatedByUuid },
          { label: t("tags"), value: file.details?.tags.join(", ") || "—" },
        ].map(field => <div key={field.label}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="wrap-anywhere">{field.value}</dd></div>)}</dl></AsideSection>
        {file.details && <ChangeHistory entity="file" uuid={file.details.uuid} />}
      </>}
  </PushAside>;
}

/** URL selection is independent of the current table page, filters and loading state. */
export function FilePreviewPanel() {
  const params = useSearchParams();
  const uuid = params?.get("file");
  const showImage = params?.get("preview") === "image";
  return uuid ? <FilePreviewAside key={`${uuid}:${showImage}`} uuid={uuid} showImage={showImage} /> : null;
}
