"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button, Heading, Table, TableCell, TableHead, TableHeader, TableRow, Throbber, Tooltip } from "@/ui/basic";
import { useSearchParams } from "next/navigation";
import { ArrowClockwise, CheckCircleFill, ChevronDown, ChevronExpand, ChevronUp, DashCircle, FileEarmarkText, Grid, Plus } from "react-bootstrap-icons";
import { formFormats, formExtensions } from "@/schemas/form-formats";
import { MAX_FORM_BYTES, hasFormResult, isProcessedForm } from "@/schemas/form-upload";
import { FILE_PAGE_SIZE, FILE_PAGE_SIZES } from "@/schemas/file-list";
import type { AppLocale } from "@/schemas/i18n";
import { TableFilters, TableToolbarPanel } from "@/ui/components/table-filters";
import { TableSearch } from "@/ui/components/table-search";
import { TableDataRegion } from "@/ui/components/table-data-region";
import { TablePaginator } from "@/ui/components/table-paginator";
import { TableQuery } from "@/ui/components/table-query";
import { FormActions, FormInfo, ConfirmRemove, ProcessedStatus } from "./form-actions";
import { InlineUploadPanel, UploadFields } from "@/ui/components/file-upload-panel";
import { useNotifications } from "@/ui/components/notification-provider";
import { TableLoadingBody } from "@/ui/components/table-loading-body";
import { useForms } from "./workspace";
import { fileExtension, formSortColumns, invalidFormSelection, MAX_FORM_FILES, sortFormEntries, uploadFormFile } from "./form-list";

export default function FormsPage() {
  const t = useTranslations("forms");
  const filesText = useTranslations("common.admin.files");
  const [refreshing, startRefresh] = useTransition();
  const format = useFormatter();
  const router = useRouter();
  const { pushNotification } = useNotifications();
  const { entries } = useForms();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const locale = useLocale() as AppLocale;
  const params = useSearchParams();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [panel, setPanel] = useState<{ id: string; kind: "info" | "delete" } | null>(null);
  const selected = entries.find(entry => entry.id === panel?.id);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const search = params.get("search")?.trim() || "";
  const mime = params.get("type") || "";
  const sort = formSortColumns.find(column => column === params.get("sort"));
  const descending = params.get("direction") === "desc";
  const sorting: Record<string, string> = sort ? { sort, direction: descending ? "desc" : "asc" } : {};
  const limit = FILE_PAGE_SIZES.find(size => String(size) === params.get("limit")) ?? FILE_PAGE_SIZE;
  const statusOptions = [
    { value: "all", icon: Grid }, { value: "yes", icon: CheckCircleFill }, { value: "no", icon: DashCircle },
  ] as const;
  const status = statusOptions.find(option => option.value === params.get("processed"))?.value ?? "all";
  const statusQuery: Record<string, string> = status === "all" ? {} : { processed: status };
  const filtered = entries.filter(entry => (!mime || entry.result.media_type === mime)
    && (status === "all" || isProcessedForm(entry.processingJson) === (status === "yes"))
    && entry.file.name.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale)));
  const requested = Number(params.get("page"));
  const page = Math.max(1, Math.min(Number.isSafeInteger(requested) ? requested : 1, Math.ceil(filtered.length / limit)));
  const rows = sortFormEntries(filtered, sort, descending, locale).slice((page - 1) * limit, page * limit);
  const filters: Record<string, string> = mime ? { type: mime } : {};
  const preserved = { ...statusQuery, ...sorting, limit: String(limit), ...(search ? { search } : {}) };
  const action = `/${locale}/forms`;
  const namespace = "common.admin.files";

  function closeUpload() {
    if (busy) return;
    setUploadOpen(false);
    setFiles([]);
    setError("");
    uploadButton.current?.focus();
  }

  function selectFiles(list: FileList | null) {
    if (!list?.length || busy) return;
    const selection = Array.from(list);
    const invalid = invalidFormSelection(selection);
    setError(!invalid ? "" : invalid.reason === "tooMany" ? t("tooMany", { max: MAX_FORM_FILES })
      : t("fileError", { name: invalid.file.name, reason: t(invalid.reason) }));
    setFiles(invalid ? [] : selection);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length || busy || refreshing) return;
    setBusy(true);
    setError("");
    const id = pushNotification({ mode: "info", message: t("working"), brief: true, pending: true });
    try {
      const failed: File[] = [];
      const errors: string[] = [];
      for (const [index, file] of files.entries()) {
        pushNotification({ id, mode: "info", pending: true, brief: true,
          message: t("uploadProgress", { current: index + 1, total: files.length, name: file.name }) });
        const reason = await uploadFormFile(file);
        if (reason) {
          failed.push(file);
          errors.push(t("fileError", { name: file.name, reason: t(reason) }));
        }
      }
      const uploaded = files.length - failed.length;
      setFiles(failed);
      if (uploaded) startRefresh(() => router.refresh());
      if (failed.length) {
        setError(errors.join("\n"));
        pushNotification({ id, mode: "error", brief: true, message: files.length === 1 ? errors[0] : t("uploadPartial", { uploaded, total: files.length }) });
      } else {
        pushNotification({ id, mode: "success", brief: true, message: files.length === 1 ? t("uploadSucceeded") : t("uploadComplete", { total: uploaded }) });
        setUploadOpen(false);
        uploadButton.current?.focus();
      }
    } finally { setBusy(false); }
  }

  return <div data-forms-content className="glass-shell mx-auto min-w-0 space-y-4 pb-8 pt-6 sm:pt-8">
    <header className="glass-panel flex items-center gap-4 p-5 sm:p-6">
      <span className="glass-icon grid size-11 shrink-0 place-items-center rounded-xl">
        <FileEarmarkText aria-hidden="true" className="size-5" />
      </span>
      <Heading level={1} className="min-w-0 text-2xl leading-tight tracking-tight sm:text-3xl">{t("title")}</Heading>
    </header>
    <TableQuery locale={locale} pathname="/forms" pending={busy || refreshing} className="glass-panel min-w-0 p-4 sm:p-6">
      <TableFilters action={action} namespace={namespace} values={filters} preserved={preserved}
        definitions={[{ key: "type", label: t("type"), options: formFormats.map(format => ({ value: format.mime, label: format.label })) }]}
        search={<TableSearch action={action} value={search} inputId="forms-search" namespace={namespace}
          preserved={{ ...statusQuery, ...sorting, limit: String(limit), ...filters }} />}
        actions={<>
          <fieldset aria-label={t("processedFilter")} className="relative grid grid-cols-3 rounded-md border border-panel-border bg-muted p-0.5">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0.5 start-0.5 w-[calc((100%-0.25rem)/3)] rounded bg-accent shadow-sm motion-safe:transition-transform"
              style={{ transform: `translateX(${statusOptions.findIndex(option => option.value === status) * 100}%)` }} />
            {statusOptions.map(({ value, icon: Icon }) => <Tooltip key={value} content={t(`filter_${value}`)} placement="bottom"><label
              className="relative flex h-6 w-7 cursor-pointer items-center justify-center rounded has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
              <input type="radio" name="forms-processed" className="sr-only" aria-label={t(`filter_${value}`)}
                checked={value === status} onChange={() => {
                  const url = new URL(window.location.href);
                  if (value === "all") url.searchParams.delete("processed"); else url.searchParams.set("processed", value);
                  url.searchParams.delete("page");
                  window.history.pushState(null, "", url);
                }} />
              <Icon aria-hidden="true" className={value === status ? "size-3.5 text-accent-foreground" : "size-3.5 text-muted-foreground"} />
            </label></Tooltip>)}
          </fieldset>
          <Button ref={uploadButton} size="sm" tone={uploadOpen ? "primary" : "main-outline"}
          style={uploadOpen ? { backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" } : undefined}
          className="h-7 min-h-7 py-0 text-xs" aria-controls="forms-upload" aria-expanded={uploadOpen}
          disabled={busy || refreshing} onClick={() => uploadOpen ? closeUpload() : setUploadOpen(true)}><Plus aria-hidden="true" />{t("add")}</Button></>}
        refreshButton={<Button size="icon" className="size-7 p-0" aria-label={filesText("refresh")}
          tooltip={filesText("refresh")} tooltipPlacement="bottom" disabled={refreshing || busy}
          onClick={() => startRefresh(() => router.refresh())}>
          {refreshing ? <Throbber size="sm" /> : <ArrowClockwise aria-hidden="true" className="size-3.5" />}
        </Button>}
        extraPanel={<TableToolbarPanel id="forms-upload" open={uploadOpen} onClose={closeUpload}>
          <InlineUploadPanel formId="form-upload" title={t("add")} submit={submit} pending={busy} close={closeUpload}
            actions={<Button type="submit" size="sm" tone="primary" disabled={!files.length || busy || refreshing}>
              {busy ? <Throbber size="sm" label={t("working")} /> : files.length > 1 ? t("submitMany", { count: files.length }) : t("submit")}
            </Button>}>
            <UploadFields formId="form-upload" inline multiple disabled={busy || refreshing} files={files}
              extensions={formExtensions} hint={t("hint", { max: MAX_FORM_FILES, mib: MAX_FORM_BYTES / 1024 ** 2 })}
              error={error} onSelect={selectFiles} />
          </InlineUploadPanel>
        </TableToolbarPanel>} />
    <TableDataRegion label={t("title")}>
      <Table aria-label={t("title")} className="[&_th]:py-1 [&_td:not([colspan])]:py-1"><TableHead><TableRow>
        {formSortColumns.map(column => {
          const active = sort === column;
          const direction = active && !descending ? "desc" : "asc";
          const Icon = !active ? ChevronExpand : descending ? ChevronDown : ChevronUp;
          const label = column === "extension" ? filesText("extension") : t(column);
          const sortLabel = filesText(direction === "asc" ? "sortAscending" : "sortDescending", { column: label });
          return <TableHeader key={column} aria-sort={active ? descending ? "descending" : "ascending" : undefined} className="relative">
            <Link href={{ pathname: "/forms", query: { ...preserved, ...filters, sort: column, direction } }} locale={locale} prefetch={false}
              aria-label={sortLabel} title={sortLabel} className="inline-flex items-center gap-1 whitespace-nowrap hover:text-primary focus-visible:outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">
              {label}<Icon aria-hidden="true" className={active ? "size-3.5 text-primary" : "size-3.5 text-muted-foreground"} />
            </Link>
          </TableHeader>;
        })}
        <TableHeader actionColumn>{t("actions")}</TableHeader>
      </TableRow></TableHead>{refreshing ? <TableLoadingBody colSpan={formSortColumns.length + 1} label={filesText("loadingData")} /> : <tbody>{rows.length ? rows.map(entry => <TableRow key={entry.id}>
        <TableCell>{hasFormResult(entry.processingJson) ? <Link className="text-accent underline" href={`/forms/${entry.id}`}>{entry.file.name}</Link> : entry.file.name}</TableCell>
        <TableCell>{fileExtension(entry.file.name).toUpperCase() || "—"}</TableCell>
        <TableCell>{format.number(entry.result.size_bytes, {style:"unit", unit:"byte"})}</TableCell>
        <TableCell><ProcessedStatus entry={entry} /></TableCell>
        <TableCell><span className={entry.paid ? "text-success" : "text-muted-foreground"}>{t(entry.paid ? "yes" : "no")}</span></TableCell>
        <TableCell actionColumn><FormActions entry={entry} active={panel?.kind === "info" && panel.id === entry.id}
          info={() => setPanel(current => current?.kind === "info" && current.id === entry.id ? null : { id: entry.id, kind: "info" })}
          discard={() => setPanel({ id: entry.id, kind: "delete" })} /></TableCell>
      </TableRow>) : <TableRow><TableCell colSpan={formSortColumns.length + 1}>{t(entries.length ? "noMatches" : "empty")}</TableCell></TableRow>}</tbody>}</Table>
    </TableDataRegion>
    <TablePaginator locale={locale} namespace={namespace} pathname="/forms"
      params={{ ...preserved, ...filters }} page={page} limit={limit} total={filtered.length} rowCount={rows.length} sizes={FILE_PAGE_SIZES} />
    </TableQuery>
    {selected && panel?.kind === "info" && <FormInfo entry={selected} close={() => setPanel(null)} />}
    {selected && panel?.kind === "delete" && <ConfirmRemove entry={selected} close={() => setPanel(null)}
      confirm={async () => {
        const response = await fetch(selected.previewUrl, { method: "DELETE" });
        if (!response.ok) throw new Error("delete failed");
        setPanel(null);
        router.refresh();
      }} />}
  </div>;
}
