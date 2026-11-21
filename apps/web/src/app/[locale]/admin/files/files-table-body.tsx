"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Download, InfoCircle, InfoCircleFill, Trash3 } from "react-bootstrap-icons";
import type { FileListRow } from "@/schemas/file-list";
import { documentExtensions } from "@/schemas/document-review";
import { canChangeFileStatus, type FileDetails, type FileStatus } from "@/schemas/file-status";
import { Badge, Button, Checkbox, TableBody, TableCell, TableRow, Throbber, Tooltip, VerticalDivider } from "@/ui/basic";
import { basicStyles, buttonTones, cx } from "@/ui/basic/styles";
import { PushAside } from "@/ui/components/aside";
import { Popup } from "@/ui/components/popup";
import { useNotifications } from "@/ui/components/notification-provider";
import { changeFileStatus, permanentlyDeleteFile } from "./actions";
import { TableLoadingBody } from "@/ui/components/table-loading-body";
import { tableStyles } from "@/ui/components/styles";
import { catalogStatusActions as statusActions } from "@/ui/components/catalog-status-actions";
import { API_ROUTES } from "@/config/api-routes";
import { ImagePreviewDropdown } from "@/ui/components/image-preview-dropdown";
import { AsideSection } from "@/ui/components/aside-section";
import { FileSummary } from "./file-summary";
import { FileRevisionRows, RestoreRevisionButton } from "./file-revision-rows";
import { StageProgress } from "./ocr/stage-progress";
import { OcrLink } from "./ocr/link";
import { UploadFileButton } from "./upload-file-button";
import { ChangeHistory } from "@/ui/components/change-history";

const statusTones = { active: "success", inactive: "neutral", pending_deletion: "danger", softdelete: "danger", pending_archiving: "warning" } as const;

export function FilesTableBody({ rows, disabled, onChanged, loading = false, ocr = false }: { rows: FileListRow[]; disabled: boolean; onChanged: () => void; loading?: boolean; ocr?: boolean }) {
  const t = useTranslations("common.admin.files");
  const format = useFormatter();
  const { pushNotification } = useNotifications();
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [changingKey, setChangingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileListRow | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [changes, setChanges] = useState<Record<string, { status: FileStatus | "deleted"; sourceUpdatedAt: number }>>({});
  const visibleRows = rows.flatMap(file => {
    const change = file.details && changes[file.details.uuid];
    if (change?.status === "deleted") return [];
    // Keep confirmed writes through failed refreshes and client-side sorting.
    // A newer authoritative record supersedes the local status immediately.
    const status = change && file.details?.updatedAt.getTime() === change.sourceUpdatedAt ? change.status : undefined;
    return [{ ...file, details: file.details && status ? { ...file.details, status } : file.details }];
  });
  const trigger = useRef<HTMLButtonElement>(null);
  const rowKey = (row: FileListRow) => ocr ? row.key : row.details?.uuid ?? row.key;
  const selected = visibleRows.find(row => rowKey(row) === activeKey);

  function rememberStatus(file: FileDetails, status: FileStatus | "deleted") {
    setChanges(previous => ({ ...previous, [file.uuid]: { status, sourceUpdatedAt: file.updatedAt.getTime() } }));
  }

  function deleteFile() {
    if (pending || disabled || !deleteTarget?.details) return;
    const details = deleteTarget.details;
    const { uuid, status: expectedStatus } = details;
    setDeleteError(false);
    setChangingKey(deleteTarget.key);
    const notificationId = pushNotification({ mode: "info", message: t("deleting"), brief: true, pending: true });
    startTransition(async () => {
      try {
        const result = await permanentlyDeleteFile({ uuid, expectedStatus, expectedVersion: deleteTarget.latestVersion ?? deleteTarget.version });
        pushNotification({ id: notificationId, mode: result.status === "ok" ? "success" : "error",
          message: t(result.status === "ok" ? "deleted" : result.status === "failed" ? "deleteFailed" : `statusErrors.${result.status}`), brief: true });
        if (result.status === "ok") rememberStatus(details, "deleted");
        if (result.status !== "failed") {
          setDeleteTarget(null);
          onChanged();
        } else { setDeleteError(true); onChanged(); }
      } catch {
        setDeleteError(true);
        pushNotification({ id: notificationId, mode: "error", message: t("deleteFailed"), brief: true });
      }
    });
  }

  function changeStatus(file: FileListRow, status: FileStatus) {
    if (pending || disabled || !file.details || file.details.deletingAt || !canChangeFileStatus(file.details.status, status)) return;
    const details = file.details;
    const { uuid, status: expectedStatus } = details;
    setChangingKey(file.key);
    const notificationId = pushNotification({ mode: "info", message: t("savingStatus"), brief: true, pending: true });
    startTransition(async () => {
      try {
        const result = await changeFileStatus({ uuid, expectedStatus, status });
        if (result.status === "ok") rememberStatus(details, status);
        pushNotification({
          id: notificationId,
          mode: result.status === "ok" ? "success" : "error",
          message: t(result.status === "ok" ? "statusSaved" : `statusErrors.${result.status}`),
          brief: true,
        });
        if (result.status === "ok" || result.status === "conflict" || result.status === "denied") onChanged();
      } catch {
        pushNotification({ id: notificationId, mode: "error", message: t("statusErrors.failed"), brief: true });
      }
    });
  }

  return <>
    {loading && <TableLoadingBody colSpan={ocr ? 8 : 7} label={t("loadingData")} />}
    <TableBody hidden={loading} inert={loading} className={tableStyles.dataBody}>
      {visibleRows.map(file => {
        const active = rowKey(file) === activeKey;
        const InfoIcon = active ? InfoCircleFill : InfoCircle;
        const busy = pending && changingKey === file.key;
        const uuid = file.details?.uuid;
        const deleting = Boolean(file.details?.deletingAt);
        const canWriteRevision = !deleting && (file.details?.status === "active" || file.details?.status === "inactive");
        const expandable = Boolean(uuid && !deleting && (file.revisionCount ?? 0) > 1);
        const expanded = expandable && expandedFile === uuid;
        return <Fragment key={rowKey(file)}><TableRow data-details-active={active ? "true" : undefined}
          aria-busy={busy} className={active ? "bg-accent/10 hover:bg-accent/15" : undefined}>
          <TableCell><Checkbox name="selectedFile" value={file.key} aria-label={t("selectFile", { name: file.name })} /></TableCell>
          <TableCell className="wrap-anywhere font-medium">{file.name}</TableCell>
          <TableCell className="tabular-nums">
            <div className="flex items-center gap-1">
              <span>{file.version ?? "—"}</span>
              {expandable && <Button size="icon" tone={expanded ? "primary" : "main-outline"} className="size-6 shrink-0 p-0"
                aria-expanded={expanded} aria-label={t("olderRevisionsFor", { name: file.name })}
                tooltip={t("olderRevisionsFor", { name: file.name })} onClick={() => setExpandedFile(expanded ? null : uuid ?? null)}>
                {expanded ? <ChevronDown aria-hidden="true" className="size-3.5" /> : <ChevronRight aria-hidden="true" className="size-3.5" />}
              </Button>}
            </div>
          </TableCell>
          <TableCell>{file.details ? <Badge tone={statusTones[file.details.status]} className="whitespace-nowrap">{deleting ? t("deletionPendingRetry") : t(`statuses.${file.details.status}`)}</Badge> : "—"}</TableCell>
          <TableCell className="whitespace-nowrap text-right tabular-nums">{format.number(file.size, { style: "unit", unit: "byte" })}</TableCell>
          <TableCell className="whitespace-nowrap tabular-nums">{format.dateTime(file.modifiedAt, { dateStyle: "medium", timeStyle: "short" })}</TableCell>
          {ocr && <TableCell>
            {file.processing && "timing" in file.processing
              ? <StageProgress label={t(file.processing.state)} percent={file.processing.percent ?? null} timing={file.processing.timing} />
              : <span className="whitespace-nowrap">{t(file.processing?.state ?? "ocrNone")}</span>}
          </TableCell>}
          <TableCell actionColumn>
            <div role="group" aria-label={t("actionsFor", { name: file.name })} className="flex items-center justify-end gap-1">
              {statusActions.map(({ status, icon, filledIcon, color }) => {
                const currentStatus = file.details?.status === status;
                const Icon = currentStatus ? filledIcon : icon;
                return <Button key={status} size="icon" tone="ghost"
                data-current-status={currentStatus ? "true" : undefined}
                className={`size-7 p-0 ${color}`} aria-label={t("setStatus", { name: file.name, status: t(`statuses.${status}`) })}
                tooltip={file.details ? t(`statusActions.${status}`) : t("uncatalogued")} tooltipPlacement="bottom"
                disabled={disabled || pending || deleting || !file.details || !canChangeFileStatus(file.details.status, status)}
                onClick={() => changeStatus(file, status)}><Icon aria-hidden="true" className="size-3.5" /></Button>;
              })}
              <Button size="icon" tone="danger-outline" className="size-7 p-0" aria-label={t("permaDeleteFor", { name: file.name })}
                tooltip={file.details ? t("perma_delete") : t("uncatalogued")} tooltipPlacement="bottom" aria-haspopup="dialog"
                disabled={disabled || pending || !file.details} onClick={() => { setDeleteError(false); setDeleteTarget(file); }}>
                <Trash3 aria-hidden="true" className="size-3.5" />
              </Button>
              <VerticalDivider />
              {uuid && file.version && !deleting && /\.(pdf|jpe?g|png)$/i.test(file.name) && <OcrLink uuid={uuid} version={file.version}/>}
              {ocr && uuid && file.version !== undefined && file.latestVersion !== undefined && file.version < file.latestVersion &&
                <RestoreRevisionButton uuid={uuid} version={file.version} currentVersion={file.latestVersion}
                  disabled={disabled || pending || !canWriteRevision} onChanged={onChanged} />}
              {uuid && file.version !== undefined && <UploadFileButton fileName={file.name} extensions={ocr ? documentExtensions : undefined}
                disabled={disabled || pending || !canWriteRevision} onUploaded={onChanged}
                target={{ uuid, expectedVersion: file.latestVersion ?? file.version }} />}
              {!deleting && file.details && file.version !== undefined ? <Tooltip content={t("download")} placement="bottom">
                <a href={`${API_ROUTES.fileDownload.replace("{uuid}", encodeURIComponent(file.details.uuid))}?version=${file.version}`}
                  download aria-label={t("downloadFor", { name: file.name, version: file.version })}
                  className={cx(basicStyles.button, buttonTones["main-outline"], "size-7 min-h-7 p-0")}>
                  <Download aria-hidden="true" className="size-3.5" />
                </a>
              </Tooltip> : <Button size="icon" className="size-7 p-0" disabled aria-label={t("download")} tooltip={t("uncatalogued")} tooltipPlacement="bottom">
                <Download aria-hidden="true" className="size-3.5" />
              </Button>}
              <Button size="icon" tone={active ? "primary" : "ghost"} aria-label={t("detailsFor", { name: file.name })}
                aria-expanded={active} tooltip={t("additionalInfo")} tooltipPlacement="bottom"
                className={active ? "size-7 p-0" : "size-7 border-primary p-0 text-primary hover:bg-primary hover:text-primary-foreground"}
                onClick={event => {
                  trigger.current = event.currentTarget;
                  setActiveKey(active ? null : rowKey(file));
                }}><InfoIcon aria-hidden="true" className="size-3.5" /></Button>
            </div>
          </TableCell>
        </TableRow>
        {expanded && uuid && file.version !== undefined && <FileRevisionRows key={file.version} uuid={uuid}
          name={file.name} currentVersion={file.version} disabled={disabled}
          canRestore={canWriteRevision} onChanged={onChanged} />}
        </Fragment>;
      })}
      {!visibleRows.length && <TableRow><TableCell colSpan={ocr ? 8 : 7} className="py-8 text-center text-muted-foreground">{t("empty")}</TableCell></TableRow>}
    </TableBody>
    {deleteTarget && <Popup title={t("perma_delete")} disableClose={pending} onClose={() => setDeleteTarget(null)}
      content={<div className="space-y-2"><p>{t("deleteConfirmation", { name: deleteTarget.name })}</p>
        {deleteError && <p role="alert" className="text-error">{t("deleteFailed")}</p>}</div>}
      actions={<>
        <Button size="sm" disabled={pending} onClick={() => setDeleteTarget(null)}>{t("cancel")}</Button>
        <Button size="sm" tone="danger-outline" disabled={disabled || pending} onClick={deleteFile}>
          {pending ? <Throbber size="sm" label={t("deleting")} /> : t("perma_delete")}
        </Button>
      </>} />}
    {selected && <PushAside open onClose={() => setActiveKey(null)} title={selected.name} triggerRef={trigger}>
      {selected.details && !selected.details.deletingAt && <ImagePreviewDropdown imageUrl={API_ROUTES.fileImage.replace("{uuid}", encodeURIComponent(selected.details.uuid)) + (ocr ? `?version=${selected.version}` : "")} name={selected.name} />}
      <FileSummary file={selected} />
      {ocr && selected.details && selected.version && <OcrLink uuid={selected.details.uuid} version={selected.version} />}
      {selected.details && selected.version !== undefined && !selected.details.deletingAt &&
        (selected.details.status === "active" || selected.details.status === "inactive") &&
        <UploadFileButton disabled={disabled} onUploaded={onChanged} extensions={ocr ? documentExtensions : undefined} target={{ uuid: selected.details.uuid, expectedVersion: selected.latestVersion ?? selected.version }} />}
      <AsideSection title={t("additionalInfo")}><dl className="space-y-3">
        {[
          { label: t("fileId"), value: selected.details?.uuid ?? "—" },
          { label: t("objectId"), value: selected.key },
          { label: t("status"), value: selected.details ? t(`statuses.${selected.details.status}`) : "—" },
          { label: t("size"), value: format.number(selected.size, { style: "unit", unit: "byte" }) },
          { label: t("modifiedAt"), value: format.dateTime(selected.modifiedAt, { dateStyle: "medium", timeStyle: "short" }) },
          { label: t("createdAt"), value: selected.details ? format.dateTime(selected.details.createdAt, { dateStyle: "medium", timeStyle: "short" }) : "—" },
          { label: t("createdBy"), value: selected.details?.createdByUuid ?? "—" },
          { label: t("updatedBy"), value: selected.details?.updatedByUuid ?? "—" },
          { label: t("tags"), value: selected.details?.tags.join(", ") || "—" },
        ].map(field => <div key={field.label}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="wrap-anywhere">{field.value}</dd></div>)}
      </dl></AsideSection>
      {!selected.details && <p className="mt-3 text-sm text-muted-foreground">{t("uncatalogued")}</p>}
      {selected.details && <ChangeHistory entity="file" uuid={selected.details.uuid} />}
    </PushAside>}
  </>;
}
