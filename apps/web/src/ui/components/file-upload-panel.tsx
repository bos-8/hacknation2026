"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { FileEarmarkArrowUp, X } from "react-bootstrap-icons";
import { Button } from "@/ui/basic";
import { cx } from "@/ui/basic/styles";

export function UploadFields({ formId, inline = false, disabled, extensions, onSelect, file, hint, error }: {
  formId: string; inline?: boolean; disabled: boolean; extensions?: readonly string[];
  onSelect: (files: FileList | null) => void; file: File | null; hint: string; error?: string | null;
}) {
  const t = useTranslations("common.admin.files");
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  return <>
      <label htmlFor={`${formId}-file`}
        className={cx("flex min-w-0 flex-wrap items-center justify-center gap-2 rounded-md border-2 border-dashed text-center transition-colors focus-within:ring-2 focus-within:ring-ring motion-reduce:transition-none",
          inline ? "min-h-16 px-2 py-2" : "min-h-40 flex-col p-4",
          dragging ? "border-primary bg-primary/10" : "border-input-border bg-input",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-primary hover:bg-primary/5")}
        onDragEnter={event => {
          if (disabled || !event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={event => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = disabled ? "none" : "copy";
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
          onSelect(event.dataTransfer.files);
        }}>
        <input id={`${formId}-file`} type="file" name="file" accept={extensions?.join(",")} disabled={disabled} className="sr-only"
          aria-describedby={`${formId}-limit ${formId}-selection${error ? ` ${formId}-error` : ""}`}
          aria-invalid={error ? true : undefined}
          onChange={event => {
            onSelect(event.currentTarget.files);
            event.currentTarget.value = "";
          }} />
        <FileEarmarkArrowUp aria-hidden="true" className={inline ? "size-5 text-primary" : "size-7 text-primary"} />
        <span className="text-sm font-medium">{t(dragging ? "dropFileHere" : "dropFile")}</span>
        <span className="rounded-md border border-button-border bg-button px-3 py-1 text-sm font-semibold text-button-foreground">{t("chooseFile")}</span>
      </label>
      <p id={`${formId}-selection`} role="status" className="break-all text-sm">{file?.name}</p>
      <p id={`${formId}-limit`} className="text-xs text-muted-foreground">{hint}</p>
      {error && <p id={`${formId}-error`} role="alert" className="text-sm text-error">{error}</p>}
  </>;
}

export function InlineUploadPanel({ formId, title, submit, pending, close, actions, children }: {
  formId: string; title: string; submit: (event: FormEvent<HTMLFormElement>) => void;
  pending: boolean; close: () => void; actions: ReactNode; children: ReactNode;
}) {
  const t = useTranslations("common.admin.files");
  return <form id={formId} onSubmit={submit} aria-label={title} aria-busy={pending}
    className="space-y-2 border-t border-border bg-muted/20 px-3 py-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
      <Button type="button" size="icon" tone="danger-outline" className="size-7 p-0" aria-label={t("cancel")}
        disabled={pending} onClick={close}><X aria-hidden="true" className="size-3.5" /></Button>
    </div>
    {children}
    <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-2">{actions}</div>
  </form>;
}
