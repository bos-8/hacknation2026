"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowClockwise, ChevronDown, ChevronExpand, ChevronUp, PencilSquare, Plus, Trash3 } from "react-bootstrap-icons";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/schemas/i18n";
import { DEFAULT_TAG_COLOR, TAG_PAGE_SIZES, parseTagQuery, tagColorSchema, tagStatusSchema, tagTextColor, tagUrlParams, type TagPage, type TagQuery, type TagResult, type TagRow, type TagStatusChange } from "@/schemas/tag";
import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Throbber, VerticalDivider } from "@/ui/basic";
import { catalogStatusActions } from "@/ui/components/catalog-status-actions";
import { useTableRefresh } from "@/ui/components/use-table-refresh";
import { TableQuery, useTableQuery } from "@/ui/components/table-query";
import { TableFilters } from "@/ui/components/table-filters";
import { TableSearch } from "@/ui/components/table-search";
import { TableDataRegion } from "@/ui/components/table-data-region";
import { TableLoadingBody } from "@/ui/components/table-loading-body";
import { TablePaginator } from "@/ui/components/table-paginator";
import { Popup } from "@/ui/components/popup";
import { useNotifications } from "@/ui/components/notification-provider";
import { AsideSection } from "@/ui/components/aside-section";
import { PushAside } from "@/ui/components/aside";
import { InfoCircle, InfoCircleFill } from "react-bootstrap-icons";
import { changeTagStatus, refreshTags, removeTag } from "./actions";
import { TagFormPanel } from "./tag-form-panel";

const statusTones = { active: "success", inactive: "neutral", pending_archiving: "warning", archived: "neutral", pending_deletion: "danger", softdelete: "danger" } as const;

export function TagsResults({ locale, initialQuery }: { locale: AppLocale; initialQuery: TagQuery }) {
  const namespace = "common.admin.tags";
  const t = useTranslations(namespace);
  const format = useFormatter();
  const query = useTableQuery(initialQuery, parseTagQuery);
  const { result, refresh, pending, status } = useTableRefresh<TagPage, TagQuery>(null, query, refreshTags);
  const [form, setForm] = useState<TagRow | "new" | null>(null);
  const [details, setDetails] = useState<TagRow | null>(null);
  const [deleting, setDeleting] = useState<TagRow | null>(null);
  const [deletePending, startDelete] = useTransition();
  const [statusPending, startStatus] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { owner, pushNotification, removeNotification } = useNotifications();
  const params = tagUrlParams(query);
  const action = `/${locale}/admin/tags`;
  const error = pending ? null : status === "denied" ? t("loadDenied") : status === "failed" ? t("loadError") : null;
  useEffect(() => {
    if (!owner || pending) return;
    if (error) pushNotification({ id: "tags-load", mode: "error", message: error, brief: true });
    else removeNotification("tags-load");
  }, [owner, pending, error, pushNotification, removeNotification]);
  const date = (value: Date) => format.dateTime(value, { dateStyle: "medium", timeStyle: "short" });
  const preserved = { limit: params.limit, sort: query.sort, direction: query.direction, search: query.search };
  function changeStatus(tag: TagRow, status: TagStatusChange["status"]) {
    if (statusPending || pending || deletePending || status === tag.status) return;
    const id = pushNotification({ mode: "info", message: t("savingStatus"), pending: true, brief: true });
    startStatus(async () => {
      let response: TagResult;
      try { response = await changeTagStatus({ uuid: tag.uuid, expectedUpdatedAt: tag.updatedAt.toISOString(), expectedStatus: tag.status, status }); }
      catch { response = { status: "failed" }; }
      pushNotification({ id, mode: response.status === "ok" ? "success" : "error", brief: true, message: t(response.status === "ok" ? "statusSaved" : `errors.${response.status}`) });
      if (response.status === "ok" || response.status === "conflict" || response.status === "denied") void refresh();
    });
  }
  function deleteSelected() {
    if (!deleting || deletePending) return;
    const tag = deleting;
    const id = pushNotification({ mode: "info", message: t("deleting"), pending: true, brief: true });
    setDeleteError(null);
    startDelete(async () => {
      let response: TagResult;
      try { response = await removeTag({ uuid: tag.uuid, expectedUpdatedAt: tag.updatedAt.toISOString() }); } catch { response = { status: "failed" }; }
      const message = t(response.status === "ok" ? "deleted" : `errors.${response.status}`);
      pushNotification({ id, message, mode: response.status === "ok" ? "success" : "error", brief: true });
      if (response.status === "ok") { setDeleting(null); void refresh(); }
      else setDeleteError(message);
    });
  }
  return <TableQuery locale={locale} pathname="/admin/tags" pending={pending}>
    <TableFilters namespace={namespace} action={action} definitions={[
      { key: "used", label: t("usage"), options: [{ value: "yes", label: t("used") }, { value: "no", label: t("unused") }] },
      { key: "status", label: t("status"), options: tagStatusSchema.options.map(value => ({ value, label: t(`statuses.${value}`) })) },
    ]}
      values={{ ...(query.used ? { used: query.used } : {}), ...(query.status ? { status: query.status } : {}) }} preserved={preserved}
      search={<TableSearch namespace={namespace} action={action} inputId="tags-search" value={query.search} preserved={{ limit: params.limit, sort: query.sort, direction: query.direction, ...(query.used ? { used: query.used } : {}), ...(query.status ? { status: query.status } : {}) }} />}
      actions={<Button size="sm" className="h-7 min-h-7 px-2 py-0 text-xs" onClick={() => setForm("new")}><Plus aria-hidden="true" className="size-3.5" />{t("addTag")}</Button>}
      refreshButton={<Button size="icon" className="size-7 p-0" tooltip={t("refresh")} tooltipPlacement="bottom" aria-label={t("refresh")} disabled={pending} onClick={refresh}>
        {pending ? <Throbber size="sm" /> : <ArrowClockwise aria-hidden="true" className="size-3.5" />}</Button>} />
    <TableDataRegion label={t("title")}><Table className="[&_th]:py-1 [&_td:not([colspan])]:py-1">
      <caption className="sr-only">{t("title")}</caption><TableHead><TableRow>
        {(["name", "color", "status", "fileCount", "updatedAt"] as const).map(column => {
          if (column === "fileCount") return <TableHeader key={column}>{t(column)}</TableHeader>;
          const active = query.sort === column;
          const Icon = !active ? ChevronExpand : query.direction === "asc" ? ChevronUp : ChevronDown;
          return <TableHeader key={column} aria-sort={active ? query.direction === "asc" ? "ascending" : "descending" : undefined}>
            <Link href={{ pathname: "/admin/tags", query: { ...params, page: "1", sort: column, direction: active && query.direction === "asc" ? "desc" : "asc" } }} locale={locale} prefetch={false}
              className="inline-flex items-center gap-1 whitespace-nowrap hover:text-primary">{t(column)}<Icon aria-hidden="true" className="size-3.5" /></Link>
          </TableHeader>;
        })}<TableHeader actionColumn>{t("rowActions")}</TableHeader>
      </TableRow></TableHead>
      {pending ? <TableLoadingBody colSpan={6} label={t("loadingData")} /> : <TableBody>
        {error && <TableRow><TableCell colSpan={6} className="py-8 text-center"><p role="alert" className="text-error">{error}</p></TableCell></TableRow>}
        {(result?.tags ?? []).map(tag => {
          const color = tagColorSchema.safeParse(tag.color).data ?? DEFAULT_TAG_COLOR;
          return <TableRow key={tag.uuid}>
            <TableCell><span className="inline-block max-w-full rounded-full px-2 py-0.5 text-xs font-medium wrap-anywhere" style={{ backgroundColor: color, color: tagTextColor(color) }}>{tag.name}</span></TableCell>
            <TableCell><span className="inline-flex items-center gap-2 whitespace-nowrap font-mono text-xs"><span aria-hidden="true" className="size-3 rounded-full border border-border" style={{ backgroundColor: color }} />{color}</span></TableCell>
            <TableCell><Badge tone={statusTones[tag.status]} className="whitespace-nowrap">{t(`statuses.${tag.status}`)}</Badge></TableCell>
            <TableCell className="tabular-nums">{tag.fileCount}</TableCell><TableCell className="whitespace-nowrap tabular-nums">{date(tag.updatedAt)}</TableCell>
            <TableCell actionColumn><div role="group" aria-label={t("actionsFor", { name: tag.name })} className="flex items-center justify-end gap-1">
              <Button size="icon" tone="main-outline" className="size-7 p-0" disabled={pending || statusPending || deletePending} aria-label={t("editFor", { name: tag.name })} tooltip={t("editTag")} tooltipPlacement="bottom" onClick={() => setForm(tag)}><PencilSquare aria-hidden="true" className="size-3.5" /></Button>
              <VerticalDivider />
              {catalogStatusActions.map(({ status, icon, filledIcon, color }) => {
                const current = tag.status === status;
                const Icon = current ? filledIcon : icon;
                return <Button key={status} size="icon" tone="ghost" className={`size-7 p-0 ${color}`} data-current-status={current ? "true" : undefined}
                  aria-label={t("setStatus", { name: tag.name, status: t(`statuses.${status}`) })} tooltip={t(`statusActions.${status}`)} tooltipPlacement="bottom"
                  disabled={current || pending || statusPending || deletePending} onClick={() => changeStatus(tag, status)}><Icon aria-hidden="true" className="size-3.5" /></Button>;
              })}
              <Button size="icon" tone="danger-outline" className="size-7 p-0" aria-label={t("deleteFor", { name: tag.name })} tooltip={t(tag.fileCount ? "inUseHint" : "deleteTag")} tooltipPlacement="bottom"
                disabled={deletePending || statusPending || tag.fileCount > 0} onClick={() => { setDeleteError(null); setDeleting(tag); }}><Trash3 aria-hidden="true" className="size-3.5" /></Button>
              <VerticalDivider /><Button size="icon" tone="main-outline" className="size-7 p-0" aria-label={t("infoFor", { name: tag.name })} tooltip={t("additionalInfo")} tooltipPlacement="bottom" onClick={() => setDetails(tag)}>
                {details?.uuid === tag.uuid ? <InfoCircleFill aria-hidden="true" className="size-3.5" /> : <InfoCircle aria-hidden="true" className="size-3.5" />}</Button>
            </div></TableCell>
          </TableRow>;
        })}
        {!result?.tags.length && !error && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{t(query.search || query.used || query.status ? "noResults" : "empty")}</TableCell></TableRow>}
      </TableBody>}
    </Table></TableDataRegion>
    <TablePaginator locale={locale} namespace={namespace} pathname="/admin/tags" params={params} page={query.page} limit={query.limit} total={result?.total ?? 0}
      rowCount={result?.tags.length ?? 0} sizes={TAG_PAGE_SIZES} unavailable={!result} />
    {form && <TagFormPanel key={form === "new" ? "new" : form.uuid} tag={form === "new" ? undefined : form} onClose={() => setForm(null)} onSaved={refresh} />}
    {details && <PushAside open title={details.name} onClose={() => setDetails(null)}><AsideSection title={t("additionalInfo")} defaultOpen>
      <dl className="space-y-3">{[{ label: "UUID", value: details.uuid }, { label: t("status"), value: t(`statuses.${details.status}`) }, { label: t("createdAt"), value: date(details.createdAt) },
        { label: t("updatedAt"), value: date(details.updatedAt) }, { label: t("createdBy"), value: details.createdByUuid }, { label: t("updatedBy"), value: details.updatedByUuid }]
        .map(field => <div key={field.label}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="wrap-anywhere">{field.value}</dd></div>)}</dl>
    </AsideSection></PushAside>}
    {deleting && <Popup title={t("deleteTag")} disableClose={deletePending} onClose={() => setDeleting(null)}
      content={<><p>{t("deleteConfirmation", { name: deleting.name })}</p>{deleteError && <p role="alert" className="text-error">{deleteError}</p>}</>}
      actions={<><Button size="sm" disabled={deletePending} onClick={() => setDeleting(null)}>{t("cancel")}</Button><Button size="sm" tone="danger-outline" disabled={deletePending} onClick={deleteSelected}>{deletePending ? <Throbber size="sm" /> : t("deleteTag")}</Button></>} />}
  </TableQuery>;
}
