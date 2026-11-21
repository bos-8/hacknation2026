"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CONFIG_DEFAULTS } from "@formiq/database/config";
import { useTranslations } from "next-intl";
import { ArrowClockwise, ChevronDown, ChevronExpand, ChevronUp, Folder, Plus } from "react-bootstrap-icons";
import { Link } from "@/i18n/navigation";
import { FILE_PAGE_SIZE, parseFileListQuery, parseOcrFileListQuery, fileSortColumnSchema, type FileListPage, type FileListQuery, type FileListRow, type FileSortColumn } from "@/schemas/file-list";
import type { AppLocale } from "@/schemas/i18n";
import { Button, Table, TableHead, TableHeader, TableRow, Throbber } from "@/ui/basic";
import { TableFilters, TableToolbarPanel } from "@/ui/components/table-filters";
import { TableSearch } from "@/ui/components/table-search";
import { useTableRefresh, type TableRefreshResult } from "@/ui/components/use-table-refresh";
import { FileUploadForm } from "./upload-file-button";
import { FilesTableBody } from "./files-table-body";
import { FilesPaginator } from "./files-paginator";
import { documentExtensions } from "@/schemas/document-review";
import { TableQuery, useTableQuery } from "@/ui/components/table-query";
import { TableLoadingBody, TableMessageBody } from "@/ui/components/table-loading-body";
import { TableDataRegion } from "@/ui/components/table-data-region";

const sortValues: Record<FileSortColumn, (file: FileListRow) => string | number | bigint | undefined> = {
  name: file => file.name,
  version: file => file.version,
  status: file => file.details?.status,
  size: file => file.size,
  modifiedAt: file => file.modifiedAt.getTime(),
};

function sortFiles(rows: FileListRow[], query: FileListQuery, locale: string) {
  if (!query.sort) return rows;
  const value = sortValues[query.sort];
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const direction = query.direction === "desc" ? -1 : 1;
  return rows.toSorted((a, b) => {
    const left = value(a), right = value(b);
    if (left === undefined || right === undefined) return Number(left === undefined) - Number(right === undefined);
    const compared = typeof left === "string" && typeof right === "string"
      ? collator.compare(left, right) : left < right ? -1 : left > right ? 1 : 0;
    return direction * (compared || collator.compare(a.key, b.key));
  });
}

export function FilesResults({ locale, query: initialQuery, initial, refreshAction, ocr = false }: {
  ocr?: boolean;
  locale: AppLocale;
  query: FileListQuery;
  initial: FileListPage | null;
  refreshAction: (query: FileListQuery) => Promise<TableRefreshResult<FileListPage>>;
}) {
  const namespace = "common.admin.files";
  const t = useTranslations(namespace);
  const query = useTableQuery(initialQuery, ocr ? parseOcrFileListQuery : parseFileListQuery);
  const { result, refresh, refreshQuietly, pending, status } = useTableRefresh(initial, query, refreshAction);
  const pollSeconds = ocr ? result?.pollSeconds ?? CONFIG_DEFAULTS.ocrPollSeconds : 0;
  useEffect(() => {
    if (!pollSeconds || pending || status === "denied") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (!document.hidden) await refreshQuietly();
      if (active) timer = setTimeout(tick, pollSeconds * 1000);
    }
    timer = setTimeout(tick, pollSeconds * 1000);
    return () => { active = false; clearTimeout(timer); };
  }, [pollSeconds, pending, refreshQuietly, status]);
  const uploadId = useId();
  const uploadTrigger = useRef<HTMLButtonElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadAttempt, setUploadAttempt] = useState(0);
  const uploadDisabled = pending || !result?.metadataReady;

  function closeUpload() {
    setUploadOpen(false);
    uploadTrigger.current?.focus();
  }

  function dismissUpload() {
    if (!uploading) closeUpload();
  }

  const pathname = ocr ? "/admin/files/ocr" : "/admin/files";
  const action = `/${locale}${pathname}`;
  const filters: Record<string, string> = {};
  if (query.tags) filters.tags = query.tags;
  if (query.revision) filters.revision = query.revision;
  if (ocr && query.extensions?.length) filters.extension = query.extensions.join(",");
  const pageSize = { limit: String(query.limit ?? FILE_PAGE_SIZE) };
  const sorting: Record<string, string> = query.sort ? { sort: query.sort, direction: query.direction ?? "asc" } : {};
  const preserved: Record<string, string> = { ...filters, ...pageSize, ...sorting };
  const selectionKey = JSON.stringify({ ...query, sort: undefined, direction: undefined });

  return <TableQuery locale={locale} pathname={pathname} pending={pending}>
    {result && <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
      <Folder aria-hidden="true" className="size-4 shrink-0" />{t("bucket", { name: result.bucket })}
    </p>}
    <TableFilters action={action} namespace={namespace} values={filters} preserved={{ ...pageSize, ...sorting, ...(query.search ? { search: query.search } : {}) }}
      definitions={[
        { key: "tags", label: t("tags"), options: [{ value: "tagged", label: t("tagged") }, { value: "untagged", label: t("untagged") }] },
        { key: "revision", label: t("version"), options: [{ value: "first", label: t("firstVersion") }, { value: "later", label: t("laterVersions") }] },
        ...(ocr ? [{ key: "extension", multiple: true, label: t("extension"), options: documentExtensions.map(value => ({ value, label: value.slice(1).toUpperCase() })) }] : []),
      ]}
      search={<TableSearch action={action} inputId="files-search" namespace={namespace} value={query.search} preserved={preserved} />}
      actions={<Button ref={uploadTrigger} size="sm" tone={uploadOpen ? "primary" : "main-outline"}
        className={`h-7 min-h-7 py-0 text-xs ${uploadOpen ? "" : "border-primary text-primary hover:bg-primary/10 hover:text-primary active:bg-primary/15"}`}
        aria-controls={uploadId} aria-expanded={uploadOpen} aria-disabled={uploading || (!uploadOpen && uploadDisabled)}
        onClick={() => {
          if (uploadOpen) dismissUpload();
          else if (!uploadDisabled && !uploading) {
            setUploadAttempt(value => value + 1);
            setUploadOpen(true);
          }
        }}><Plus aria-hidden="true" className="size-4" />{t("addFile")}</Button>}
      extraPanel={<TableToolbarPanel id={uploadId} open={uploadOpen} onClose={dismissUpload}>
        <FileUploadForm key={uploadAttempt} inline disabled={uploadDisabled} close={closeUpload} extensions={ocr ? documentExtensions : undefined}
          onUploadingChange={setUploading} onUploaded={refresh} />
      </TableToolbarPanel>}
      refreshButton={
        <Button size="icon" className="size-7 p-0" aria-label={t("refresh")} tooltip={t("refresh")} tooltipPlacement="bottom"
          disabled={pending} onClick={refresh}>
          {pending ? <Throbber size="sm" /> : <ArrowClockwise aria-hidden="true" className="size-3.5" />}
        </Button>
      } />
      {status === "failed" && <p role="status" className="rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm">{t("refreshFailed")}</p>}
      {result && !result.metadataReady && <p role="status" className="rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm">{t("metadataUnavailable")}</p>}
      <p className="px-1 text-xs text-muted-foreground">{t(ocr ? "ocrScope" : "catalogScope")}</p>
      <TableDataRegion label={t("title")}>
        <Table className="[&_th]:py-1 [&_td:not([colspan])]:py-1">
          <caption className="sr-only">{t("title")}</caption>
          <TableHead><TableRow>
            <TableHeader scope="col" className="w-1"><span className="sr-only">{t("selection")}</span></TableHeader>
            {fileSortColumnSchema.options.map(column => {
              const active = query.sort === column;
              const descending = active && query.direction === "desc";
              const direction = active && !descending ? "desc" : "asc";
              const Icon = !active ? ChevronExpand : descending ? ChevronDown : ChevronUp;
              const label = t(column);
              const sortLabel = t(direction === "asc" ? "sortAscending" : "sortDescending", { column: label });
              return <TableHeader key={column} scope="col" className={`relative ${column === "size" ? "text-right" : ""}`}
                aria-sort={active ? descending ? "descending" : "ascending" : undefined}>
                <Link href={{ pathname, query: {
                  ...preserved, ...(query.search ? { search: query.search } : {}),
                  page: String(query.page ?? 1),
                  sort: column, direction,
                } }} locale={locale} prefetch={false} aria-label={sortLabel} title={sortLabel}
                  className="inline-flex items-center gap-1 whitespace-nowrap hover:text-primary focus-visible:outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">
                  {label}<Icon aria-hidden="true" className={active ? "size-3.5 shrink-0 text-primary" : "size-3.5 shrink-0 text-muted-foreground"} />
                </Link>
              </TableHeader>;
            })}
            {ocr && <TableHeader scope="col">{t("processing")}</TableHeader>}
            <TableHeader actionColumn scope="col">{t("rowActions")}</TableHeader>
          </TableRow></TableHead>
          {!result && pending ? <TableLoadingBody colSpan={ocr ? 8 : 7} label={t("loadingData")} /> : !result
            ? <TableMessageBody colSpan={ocr ? 8 : 7} error message={t(status === "denied" ? "refreshDenied" : "unavailable")} />
            : <FilesTableBody key={selectionKey} ocr={ocr} rows={sortFiles(result.rows, query, locale)} loading={pending} disabled={pending || !result.metadataReady} onChanged={refresh} />}
        </Table>
      </TableDataRegion>
      <FilesPaginator locale={locale} pathname={pathname} query={query} rowCount={result?.rows.length ?? 0} total={result?.total ?? null} />
  </TableQuery>;
}
