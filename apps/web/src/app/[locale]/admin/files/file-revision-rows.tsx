"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowCounterclockwise, Download, InfoCircle, InfoCircleFill } from "react-bootstrap-icons";
import { API_ROUTES } from "@/config/api-routes";
import type { FileRevisionRow } from "@/schemas/file-list";
import { Button, TableCell, TableRow, Tooltip } from "@/ui/basic";
import { basicStyles, buttonTones, cx } from "@/ui/basic/styles";
import { PushAside } from "@/ui/components/aside";
import { PrivateImagePreview } from "@/ui/components/private-image-preview";
import { Popup } from "@/ui/components/popup";
import { useNotifications } from "@/ui/components/notification-provider";
import { readOlderRevisions, restoreFileRevision } from "./actions";
import { OcrLink } from "./ocr/link";

export function RestoreRevisionButton({ uuid, version, currentVersion, disabled, onChanged }: {
  uuid: string; version: number; currentVersion: number; disabled: boolean; onChanged: () => void;
}) {
  const t = useTranslations("common.admin.files");
  const { pushNotification } = useNotifications();
  const [expectedVersion, setExpectedVersion] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  function confirmRestore() {
    if (expectedVersion === null || pending || disabled) return;
    startTransition(async () => {
      try {
        const result = await restoreFileRevision({ uuid, expectedVersion, version });
        pushNotification({ mode: result.status === "ok" ? "success" : "error", brief: true,
          message: t(result.status === "ok" ? "revisionRestored" : `statusErrors.${result.status}`) });
        if (result.status === "ok" || result.status === "conflict") onChanged();
      } catch {
        pushNotification({ mode: "error", brief: true, message: t("statusErrors.failed") });
      } finally { setExpectedVersion(null); }
    });
  }

  return <>
    <Button size="icon" tone="main-outline" className="size-7 p-0" disabled={disabled || pending}
      aria-label={t("restoreRevision")} tooltip={t("restoreRevision")} tooltipPlacement="bottom"
      aria-haspopup="dialog" onClick={() => setExpectedVersion(currentVersion)}>
      <ArrowCounterclockwise aria-hidden="true" className="size-3.5" />
    </Button>
    {expectedVersion !== null && <Popup title={t("restoreRevision")} onClose={() => setExpectedVersion(null)} disableClose={pending}
      content={<p>{t("confirmRestoreRevision", { version })}</p>}
      actions={<>
        <Button disabled={pending} onClick={() => setExpectedVersion(null)}>{t("cancel")}</Button>
        <Button disabled={pending || disabled} onClick={confirmRestore}>{t("restoreRevision")}</Button>
      </>} />}
  </>;
}

export function FileRevisionRows({ uuid, name, currentVersion, disabled, canRestore, onChanged }: {
  uuid: string; name: string; currentVersion: number; disabled: boolean; canRestore: boolean; onChanged: () => void;
}) {
  const t = useTranslations("common.admin.files");
  const format = useFormatter();
  const [rows, setRows] = useState<FileRevisionRow[]>([]);
  const [more, setMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState<{ version: number; open: boolean } | null>(null);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const selectedRevision = rows.find(row => row.version === preview?.version);

  useEffect(() => {
    let active = true;
    void readOlderRevisions(uuid, currentVersion).then(result => {
      if (!active) return;
      if (result.status === "ok") { setRows(result.rows); setMore(result.more); }
      else setError(true);
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [uuid, currentVersion]);

  function loadMore() {
    startTransition(async () => {
      setError(false);
      try {
        const result = await readOlderRevisions(uuid, rows.at(-1)?.version ?? currentVersion);
        if (result.status !== "ok") { setError(true); return; }
        setRows(previous => [...previous, ...result.rows]);
        setMore(result.more);
      } catch { setError(true); }
    });
  }

  return <>
    {rows.map(row => {
      const query = `?version=${row.version}`;
      const download = API_ROUTES.fileDownload.replace("{uuid}", uuid) + query;
      const previewOpen = preview?.version === row.version && preview.open;
      const PreviewIcon = previewOpen ? InfoCircleFill : InfoCircle;
      return <TableRow key={row.version} className="bg-accent/5">
        <TableCell />
        <TableCell />
        <TableCell>{row.version}</TableCell>
        <TableCell />
        <TableCell className="text-right">{format.number(row.size, { style: "unit", unit: "byte" })}</TableCell>
        <TableCell>{format.dateTime(row.createdAt, { dateStyle: "medium", timeStyle: "short" })}</TableCell>
        <TableCell actionColumn>
          <div role="group" aria-label={t("actionsForRevision", { name, version: row.version })} className="flex items-center justify-end gap-1">
            {/\.(pdf|jpe?g|png)$/i.test(row.fileName ?? name) && <OcrLink uuid={uuid} version={row.version}/>}
            <RestoreRevisionButton uuid={uuid} version={row.version} currentVersion={currentVersion}
              disabled={disabled || pending || !canRestore} onChanged={onChanged} />
            <Tooltip content={t("download")} placement="bottom">
              <a href={download} download className={cx(basicStyles.button, buttonTones["main-outline"], "size-7 min-h-7 p-0")}
                aria-label={t("downloadFor", { name, version: row.version })}>
                <Download aria-hidden="true" className="size-3.5" />
              </a>
            </Tooltip>
            <Button size="icon" tone={previewOpen ? "primary" : "ghost"} aria-label={t("revisionPreview")}
              tooltip={t("revisionPreview")} tooltipPlacement="bottom" aria-expanded={previewOpen}
              className={previewOpen ? "size-7 p-0" : "size-7 border-primary p-0 text-primary hover:bg-primary hover:text-primary-foreground"}
              onClick={event => {
                previewTrigger.current = event.currentTarget;
                setPreview({ version: row.version, open: !previewOpen });
              }}>
              <PreviewIcon aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>;
    })}
    {(!ready || error || more) && <TableRow><TableCell colSpan={7} className="ps-8">
      {!ready && <span role="status">{t("loadingData")}</span>}
      {error && <span role="alert">{t("refreshFailed")}</span>}
      {(more || error) && <Button type="button" size="sm" disabled={pending || disabled}
        onClick={loadMore}>{t("loadOlderRevisions")}</Button>}
    </TableCell></TableRow>}
    {selectedRevision && <PushAside open={preview?.open === true}
      onClose={() => setPreview(current => current && { ...current, open: false })}
      triggerRef={previewTrigger} title={name}
      description={t("revisionLabel", { version: selectedRevision.version })}>
      <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-muted-foreground">{t("size")}</dt>
          <dd>{format.number(selectedRevision.size, { style: "unit", unit: "byte" })}</dd></div>
        <div><dt className="text-muted-foreground">{t("createdAt")}</dt>
          <dd>{format.dateTime(selectedRevision.createdAt, { dateStyle: "medium", timeStyle: "short" })}</dd></div>
      </dl>
      {preview?.open && <PrivateImagePreview name={name}
        imageUrl={`${API_ROUTES.fileImage.replace("{uuid}", uuid)}?version=${selectedRevision.version}`} />}
    </PushAside>}
  </>;
}
