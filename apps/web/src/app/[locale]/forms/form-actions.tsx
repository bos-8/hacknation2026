"use client";

import { useFormatter, useTranslations } from "next-intl";
import { CheckCircleFill, DashCircle, Download, BoxArrowUpRight, InfoCircle, Trash } from "react-bootstrap-icons";
import { Link } from "@/i18n/navigation";
import { Button } from "@/ui/basic";
import { Aside } from "@/ui/components/aside";
import { Popup } from "@/ui/components/popup";
import type { FormEntry } from "./workspace";

export function ProcessedStatus({ entry }: { entry: FormEntry }) {
  const t = useTranslations("forms");
  const done = entry.coiJson != null;
  const Icon = done ? CheckCircleFill : DashCircle;
  return <span role="img" aria-label={t(done ? "yes" : "no")} title={t(done ? "yes" : "no")}>
    <Icon aria-hidden="true" className={done ? "size-4 text-success" : "size-4 text-warning"} />
  </span>;
}

const iconLink = "inline-flex size-7 items-center justify-center rounded-md border focus-visible:outline-2 focus-visible:outline-offset-2";

export function FormActions({ entry, info, discard }: { entry: FormEntry; info: () => void; discard: () => void }) {
  const t = useTranslations("forms");
  const name = entry.file.name;
  return <div className="flex items-center justify-end gap-1">
    <Link href={`/forms/${entry.id}`} className={`${iconLink} border-primary/50 text-primary hover:bg-primary/10`}
      aria-label={t("openNamed", { name })} title={t("details")}><BoxArrowUpRight aria-hidden="true" /></Link>
    <a download={`${name}.json`} className={`${iconLink} border-success/50 text-success hover:bg-success/10`}
      href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(entry.coiJson ?? entry.result, null, 2))}`}
      aria-label={t("downloadNamed", { name })} title={t("download")}><Download aria-hidden="true" /></a>
    <Button size="icon" tone="danger-outline" className="size-7 p-0" onClick={discard} aria-label={t("removeNamed", { name })} tooltip={t("remove")}><Trash aria-hidden="true" /></Button>
    <Button size="icon" tone="warning-outline" className="ms-1 size-7 p-0" onClick={info} aria-label={t("infoNamed", { name })} tooltip={t("info")}><InfoCircle aria-hidden="true" /></Button>
  </div>;
}

export function FormInfo({ entry, close }: { entry: FormEntry; close: () => void }) {
  const t = useTranslations("forms");
  const format = useFormatter();
  const date = (ms: number) => format.dateTime(ms, { dateStyle: "medium", timeStyle: "medium" });
  const fields = [
    [t("name"), entry.file.name], [t("id"), entry.id], [t("uploader"), entry.uploader],
    [t("uploaded"), date(entry.uploadedAt)], [t("modified"), date(entry.file.lastModified)],
    [t("type"), entry.result.media_type], [t("size"), format.number(entry.result.size_bytes, {style:"unit", unit:"byte"})],
    [t("result"), t("valid")], [t("processed"), t(entry.coiJson == null ? "no" : "yes")],
  ];
  return <Aside open variant="push" onClose={close} title={t("info")} description={entry.file.name}
    icon={<InfoCircle className="text-warning" aria-hidden="true" />}>
    <dl className="divide-y divide-panel-border px-4">{fields.map(([label, value]) =>
      <div key={label} className="py-2"><dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="break-words text-sm font-medium">{value}</dd></div>)}</dl>
  </Aside>;
}

export function ConfirmRemove({ entry, close, confirm }: { entry: FormEntry; close: () => void; confirm: () => void }) {
  const t = useTranslations("forms");
  return <Popup title={t("remove")} onClose={close} content={t("confirmRemove", { name: entry.file.name })}
    actions={<><Button onClick={close}>{t("cancel")}</Button><Button tone="error" onClick={confirm}>{t("remove")}</Button></>} />;
}
