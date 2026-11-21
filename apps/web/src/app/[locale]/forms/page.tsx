"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button, Heading, Table, TableCell, TableHead, TableHeader, TableRow, Throbber } from "@/ui/basic";
import { useSearchParams } from "next/navigation";
import { ArrowClockwise, CheckCircleFill, DashCircle, Grid, Plus } from "react-bootstrap-icons";
import { formFormats, formExtensions } from "@/schemas/form-formats";
import { FILE_PAGE_SIZE, FILE_PAGE_SIZES } from "@/schemas/file-list";
import type { AppLocale } from "@/schemas/i18n";
import { TableFilters, TableToolbarPanel } from "@/ui/components/table-filters";
import { TableSearch } from "@/ui/components/table-search";
import { TableDataRegion } from "@/ui/components/table-data-region";
import { TablePaginator } from "@/ui/components/table-paginator";
import { TableQuery } from "@/ui/components/table-query";
import { FormActions, FormInfo, ConfirmRemove, ProcessedStatus } from "./form-actions";
import { InlineUploadPanel, UploadFields } from "@/ui/components/file-upload-panel";
import { TableLoadingBody } from "@/ui/components/table-loading-body";
import { useForms } from "./workspace";

export default function FormsPage() {
  const t = useTranslations("forms");
  const filesText = useTranslations("common.admin.files");
  const [refreshing, startRefresh] = useTransition();
  const format = useFormatter();
  const router = useRouter();
  const { entries, add, remove } = useForms();
  const [file, setFile] = useState<File | null>(null);
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
  const limit = FILE_PAGE_SIZES.find(size => String(size) === params.get("limit")) ?? FILE_PAGE_SIZE;
  const statusOptions = [
    { value: "all", icon: Grid }, { value: "yes", icon: CheckCircleFill }, { value: "no", icon: DashCircle },
  ] as const;
  const status = statusOptions.find(option => option.value === params.get("processed"))?.value ?? "all";
  const statusQuery: Record<string, string> = status === "all" ? {} : { processed: status };
  const filtered = entries.filter(entry => (!mime || entry.result.media_type === mime)
    && (status === "all" || (entry.coiJson != null) === (status === "yes"))
    && entry.file.name.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale)));
  const requested = Number(params.get("page"));
  const page = Math.max(1, Math.min(Number.isSafeInteger(requested) ? requested : 1, Math.ceil(filtered.length / limit)));
  const rows = filtered.slice((page - 1) * limit, page * limit);
  const filters: Record<string, string> = mime ? { type: mime } : {};
  const preserved = { ...statusQuery, limit: String(limit), ...(search ? { search } : {}) };
  const action = `/${locale}/forms`;
  const namespace = "common.admin.files";

  function closeUpload() {
    if (busy) return;
    setUploadOpen(false);
    setFile(null);
    setError("");
    uploadButton.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!file || busy) return;
    if (file.size > 20 * 1024 * 1024) { setError(t("large")); return; }
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/v1/forms/validate", { method: "POST", body });
      if (!response.ok) {
        const errors: Record<number, string> = { 401: "denied", 403: "denied", 413: "large", 415: "invalid", 422: "invalid", 429: "busy" };
        setError(t(errors[response.status] || "failed"));
        return;
      }
      const result = await response.json();
      const id = crypto.randomUUID();
      add({ id, file, result });
      form.reset();
      setFile(null);
      setUploadOpen(false);
      router.push(`/forms/${id}`);
    } catch { setError(t("failed")); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
    <Heading level={1}>{t("title")}</Heading>
    <TableQuery locale={locale} pathname="/forms" pending={busy || refreshing}>
      <TableFilters action={action} namespace={namespace} values={filters} preserved={preserved}
        definitions={[{ key: "type", label: t("type"), options: formFormats.map(format => ({ value: format.mime, label: format.label })) }]}
        search={<TableSearch action={action} value={search} inputId="forms-search" namespace={namespace}
          preserved={{ ...statusQuery, limit: String(limit), ...filters }} />}
        actions={<>
          <fieldset aria-label={t("processedFilter")} className="relative grid grid-cols-3 rounded-md border border-panel-border bg-muted p-0.5">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0.5 start-0.5 w-[calc((100%-0.25rem)/3)] rounded bg-accent shadow-sm motion-safe:transition-transform"
              style={{ transform: `translateX(${statusOptions.findIndex(option => option.value === status) * 100}%)` }} />
            {statusOptions.map(({ value, icon: Icon }) => <label key={value} title={t(`filter_${value}`)}
              className="relative flex h-6 w-7 cursor-pointer items-center justify-center rounded has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
              <input type="radio" name="forms-processed" className="sr-only" aria-label={t(`filter_${value}`)}
                checked={value === status} onChange={() => {
                  const url = new URL(window.location.href);
                  if (value === "all") url.searchParams.delete("processed"); else url.searchParams.set("processed", value);
                  url.searchParams.delete("page");
                  window.history.pushState(null, "", url);
                }} />
              <Icon aria-hidden="true" className={value === status ? "size-3.5 text-accent-foreground" : "size-3.5 text-muted-foreground"} />
            </label>)}
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
            actions={<Button type="submit" size="sm" tone="primary" disabled={!file || busy || refreshing}>
              {busy ? <Throbber size="sm" label={t("working")} /> : t("submit")}
            </Button>}>
            <UploadFields formId="form-upload" inline disabled={busy || refreshing} file={file}
              extensions={formExtensions} hint={t("hint")} error={error}
              onSelect={files => {
                if (!files?.length) return;
                const selected = files[0];
                const problem = files.length !== 1 ? filesText("oneFileOnly")
                  : !selected.size || !formExtensions.some(ext => selected.name.toLowerCase().endsWith(ext)) ? t("invalid")
                  : selected.size > 20 * 1024 * 1024 ? t("large") : "";
                setError(problem);
                setFile(problem ? null : selected);
              }} />
          </InlineUploadPanel>
        </TableToolbarPanel>} />
    <TableDataRegion label={t("title")}>
      <Table aria-label={t("title")} className="[&_th]:py-1 [&_td:not([colspan])]:py-1"><TableHead><TableRow>
        <TableHeader>{t("name")}</TableHeader><TableHeader>{t("size")}</TableHeader><TableHeader>{t("processed")}</TableHeader><TableHeader actionColumn>{t("actions")}</TableHeader>
      </TableRow></TableHead>{refreshing ? <TableLoadingBody colSpan={4} label={filesText("loadingData")} /> : <tbody>{rows.length ? rows.map(entry => <TableRow key={entry.id}>
        <TableCell><Link className="text-accent underline" href={`/forms/${entry.id}`}>{entry.file.name}</Link></TableCell>
        <TableCell>{format.number(entry.result.size_bytes, {style:"unit", unit:"byte"})}</TableCell>
        <TableCell><ProcessedStatus entry={entry} /></TableCell>
        <TableCell actionColumn><FormActions entry={entry} info={() => setPanel({ id: entry.id, kind: "info" })}
          discard={() => setPanel({ id: entry.id, kind: "delete" })} /></TableCell>
      </TableRow>) : <TableRow><TableCell colSpan={4}>{t(entries.length ? "noMatches" : "empty")}</TableCell></TableRow>}</tbody>}</Table>
    </TableDataRegion>
    <TablePaginator locale={locale} namespace={namespace} pathname="/forms"
      params={{ ...preserved, ...filters }} page={page} limit={limit} total={filtered.length} rowCount={rows.length} sizes={FILE_PAGE_SIZES} />
    </TableQuery>
    {selected && panel?.kind === "info" && <FormInfo entry={selected} close={() => setPanel(null)} />}
    {selected && panel?.kind === "delete" && <ConfirmRemove entry={selected} close={() => setPanel(null)}
      confirm={() => { remove(selected); setPanel(null); }} />}
  </main>;
}
