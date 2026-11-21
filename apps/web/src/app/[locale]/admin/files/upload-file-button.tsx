"use client";

import { useId, useRef, useState, useTransition, type DragEvent, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { FileEarmarkArrowUp, Plus, X } from "react-bootstrap-icons";
import { MAX_FILE_UPLOAD_BYTES, fileUploadStatuses, type FileUploadResult } from "@/schemas/file-upload";
import { API_ROUTES } from "@/config/api-routes";
import { Button, Throbber } from "@/ui/basic";
import { cx } from "@/ui/basic/styles";
import { Popup } from "@/ui/components/popup";
import { useNotifications } from "@/ui/components/notification-provider";

type UploadError = Exclude<FileUploadResult["status"], "ok">;

type RevisionTarget = { uuid: string; expectedVersion: number };

function sendFile(file: File, target: RevisionTarget | undefined,
  onProgress: (loaded: number, secondsRemaining: number | undefined) => void): Promise<FileUploadResult["status"]> {
  return new Promise(resolve => {
    const request = new XMLHttpRequest();
    const url = new URL(API_ROUTES.fileUpload, window.location.origin);
    if (target) {
      url.searchParams.set("uuid", target.uuid);
      url.searchParams.set("expectedVersion", String(target.expectedVersion));
    }
    let lastUpdate = 0;
    const started = performance.now();
    request.upload.onprogress = ({ loaded }) => {
      const now = performance.now();
      if (loaded >= file.size || now - lastUpdate < 250) return;
      lastUpdate = now;
      const elapsed = (now - started) / 1000;
      const remaining = elapsed >= 0.5 && loaded > 0 ? Math.ceil((file.size - loaded) * elapsed / loaded) : undefined;
      onProgress(loaded, remaining);
    };
    request.upload.onload = () => onProgress(file.size, undefined);
    request.open("POST", url);
    request.responseType = "json";
    request.timeout = 160000;
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    request.onload = () => {
      const status = request.response?.status;
      resolve(fileUploadStatuses.includes(status) ? status : request.status === 413 ? "tooLarge" : "uploadFailed");
    };
    request.onerror = request.onabort = request.ontimeout = () => resolve("uploadFailed");
    request.send(file);
  });
}

export function FileUploadForm({ close, onUploaded, target, inline = false, onUploadingChange, disabled = false, extensions }: {
  close: () => void; onUploaded: () => void; target?: RevisionTarget; inline?: boolean;
  onUploadingChange?: (uploading: boolean) => void; disabled?: boolean;
  extensions?: readonly string[];
}) {
  const t = useTranslations("common.admin.files");
  const format = useFormatter();
  const { pushNotification } = useNotifications();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<UploadError | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [multipleFiles, setMultipleFiles] = useState(false);

  function selectFiles(files: FileList | null) {
    if (pending || disabled || !files?.length) return;
    const selected = files[0];
    const invalid = files.length !== 1 || selected.size === 0 ||
      (extensions && !extensions.some(ext => selected.name.toLowerCase().endsWith(ext)));
    const tooLarge = selected.size > MAX_FILE_UPLOAD_BYTES;
    setMultipleFiles(files.length !== 1);
    setError(invalid ? "invalid" : tooLarge ? "tooLarge" : null);
    setFile(invalid || tooLarge ? null : selected);
  }

  function dragEnter(event: DragEvent<HTMLLabelElement>) {
    if (pending || disabled || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled || !file) return;
    const selected = file;
    const bytes = (value: number) => format.number(value, { style: "unit", unit: "byte", notation: "compact" });
    const title = selected.name;
    const progress = (loaded: number, secondsRemaining?: number) => {
      const percent = Math.floor(loaded / selected.size * 100);
      const transferred = t("uploadTransferred", { loaded: bytes(loaded), total: bytes(selected.size), percent });
      const stage = loaded === selected.size ? t("uploadSaving")
        : secondsRemaining === undefined ? t("uploadEstimating") : t("uploadRemaining", { seconds: secondsRemaining });
      return <><p>{transferred}</p><p className="text-muted-foreground">{stage}</p></>;
    };
    const notificationId = pushNotification({ mode: "info", title, message: progress(0), pending: true, dismissible: false });
    function finish(status: FileUploadResult["status"]) {
      if (status !== "ok") setError(status);
      pushNotification({ id: notificationId, mode: status === "ok" ? "success" : "error", title,
        message: t(status === "ok" ? "uploaded" : `uploadErrors.${status}`), autoCloseMs: 8000 });
    }
    setError(null);
    onUploadingChange?.(true);
    startTransition(async () => {
      try {
        const status = await sendFile(selected, target, (loaded, seconds) => {
          if (notificationId) pushNotification({ id: notificationId, mode: "info", title,
            message: progress(loaded, seconds), pending: true, dismissible: false });
        });
        finish(status);
        if (status !== "ok") return;
        close();
        onUploaded();
      } catch {
        finish("uploadFailed");
      } finally {
        onUploadingChange?.(false);
      }
    });
  }

  const title = t(target ? "addRevision" : "addFile");
  const fields = <>
      <label htmlFor={`${formId}-file`}
        className={cx("flex min-w-0 flex-wrap items-center justify-center gap-2 rounded-md border-2 border-dashed text-center transition-colors focus-within:ring-2 focus-within:ring-ring motion-reduce:transition-none",
          inline ? "min-h-16 px-2 py-2" : "min-h-40 flex-col p-4",
          dragging ? "border-primary bg-primary/10" : "border-input-border bg-input",
          pending || disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-primary hover:bg-primary/5")}
        onDragEnter={dragEnter}
        onDragOver={event => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = pending || disabled ? "none" : "copy";
        }}
        onDragLeave={event => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={event => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          selectFiles(event.dataTransfer.files);
        }}>
        <input id={`${formId}-file`} type="file" name="file" accept={extensions?.join(",")} disabled={pending || disabled} className="sr-only"
          aria-describedby={`${formId}-limit ${formId}-selection${error ? ` ${formId}-error` : ""}`}
          aria-invalid={error ? true : undefined}
          onChange={event => {
            selectFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }} />
        <FileEarmarkArrowUp aria-hidden="true" className={inline ? "size-5 text-primary" : "size-7 text-primary"} />
        <span className="text-sm font-medium">{t(dragging ? "dropFileHere" : "dropFile")}</span>
        <span className="rounded-md border border-button-border bg-button px-3 py-1 text-sm font-semibold text-button-foreground">{t("chooseFile")}</span>
      </label>
      <p id={`${formId}-selection`} role="status" className="break-all text-sm">{file?.name}</p>
      <p id={`${formId}-limit`} className="text-xs text-muted-foreground">{t("fileLimit", { mib: MAX_FILE_UPLOAD_BYTES / 1024 / 1024 })}</p>
      {error && <p id={`${formId}-error`} role="alert" className="text-sm text-error">{t(multipleFiles ? "oneFileOnly" : `uploadErrors.${error}`)}</p>}
  </>;
  const actions = <>
    {!inline && <Button size="sm" disabled={pending} onClick={close}>{t("cancel")}</Button>}
    <Button size="sm" type="submit" form={formId} tone="primary" disabled={pending || disabled || !file}>
      {pending ? <Throbber size="sm" label={t("uploading")} /> : t("upload")}
    </Button>
  </>;
  if (inline) return <form id={formId} onSubmit={submit} aria-label={title} aria-busy={pending}
    className="space-y-2 border-t border-border bg-muted/20 px-3 py-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
      <Button type="button" size="icon" tone="danger-outline" className="size-7 p-0" aria-label={t("cancel")}
        disabled={pending} onClick={close}><X aria-hidden="true" className="size-3.5" /></Button>
    </div>
    {fields}
    <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-2">{actions}</div>
  </form>;
  return <Popup title={title} disableClose={pending} onClose={close}
    content={<form id={formId} onSubmit={submit} aria-busy={pending} className="space-y-2">{fields}</form>}
    actions={actions} />;
}

export function UploadFileButton({ disabled, onUploaded, target, fileName, extensions }: {
  disabled: boolean; onUploaded: () => void; target: RevisionTarget; fileName?: string; extensions?: readonly string[];
}) {
  const t = useTranslations("common.admin.files");
  const [selectedTarget, setSelectedTarget] = useState<RevisionTarget | null>(null);
  const open = selectedTarget !== null;
  return <>
    {fileName === undefined ? <Button size="sm" tone="primary" className="h-7 min-h-7 py-0 text-xs" aria-haspopup="dialog"
      aria-expanded={open} disabled={disabled} onClick={() => setSelectedTarget(target)}>
      <Plus aria-hidden="true" className="size-4" />{t("addRevision")}
    </Button> : <Button size="icon" tone="main-outline" className="size-7 p-0" aria-haspopup="dialog"
      aria-expanded={open} aria-label={t("replaceFileFor", { name: fileName })} tooltip={t("replaceFileFor", { name: fileName })}
      tooltipPlacement="bottom" disabled={disabled} onClick={() => setSelectedTarget(target)}>
      <FileEarmarkArrowUp aria-hidden="true" className="size-3.5" />
    </Button>}
    {selectedTarget && <FileUploadForm close={() => setSelectedTarget(null)} onUploaded={onUploaded} target={selectedTarget} extensions={extensions} />}
  </>;
}
