"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { FileListRow } from "@/schemas/file-list";

/** Essential file data stays visible when the preview and metadata are collapsed. */
export function FileSummary({ file }: { file: FileListRow }) {
  const t = useTranslations("common.admin.files");
  const format = useFormatter();
  return <dl className="mb-4 space-y-3">{[
    { label: t("name"), value: file.name },
    { label: t("version"), value: file.version ?? "—" },
    { label: t("updatedAt"), value: format.dateTime(file.details?.updatedAt ?? file.modifiedAt, { dateStyle: "medium", timeStyle: "short" }) },
  ].map(field => <div key={field.label}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="wrap-anywhere">{field.value}</dd></div>)}</dl>;
}
