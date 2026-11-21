"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowClockwise, ArrowRepeat, ChevronDown, InfoCircle, PlayCircle, StopCircle, Trash } from "react-bootstrap-icons";
import { DOCUMENT_QUEUE, queueActionAllowed, type QueueAction } from '@formiq/queue/contracts';
import type { AppLocale } from "@/schemas/i18n";
import { QUEUE_PAGE_SIZES, jobStateSchema, parseQueueQuery, queueUrlParams, type JobRow, type QueuePage, type QueueQuery } from "@/schemas/queue";
import { Badge, Button, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Throbber, VerticalDivider } from "@/ui/basic";
import { TableQuery, useTableQuery } from "@/ui/components/table-query";
import { TableFilters } from "@/ui/components/table-filters";
import { TableSearch } from "@/ui/components/table-search";
import { TablePaginator } from "@/ui/components/table-paginator";
import { TableDataRegion } from "@/ui/components/table-data-region";
import { TableLoadingBody } from "@/ui/components/table-loading-body";
import { useTableRefresh } from "@/ui/components/use-table-refresh";
import { queueTiming } from "@/ui/components/styles";
import { useNotifications } from "@/ui/components/notification-provider";
import { Popup } from "@/ui/components/popup";
import { PushAside } from "@/ui/components/aside";
import { AsideSection } from "@/ui/components/aside-section";
import { refreshQueue, testQueue, changeQueueJob } from "./actions";

const tones = { created: "neutral", retry: "warning", active: "primary", completed: "success", cancelled: "neutral", failed: "danger" } as const;

export function QueueResults({ locale, initialQuery }: { locale: AppLocale; initialQuery: QueueQuery }) {
  const namespace = "common.admin.queue";
  const t = useTranslations(namespace);
  const format = useFormatter();
  const query = useTableQuery(initialQuery, parseQueueQuery);
  const { result, refresh, pending, status } = useTableRefresh<QueuePage, QueueQuery>(null, query, refreshQueue);
  const { owner, pushNotification, removeNotification } = useNotifications();
  const [selected, setSelected] = useState<JobRow | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [failures, setFailures] = useState(0);
  const [executor, setExecutor] = useState<'node' | 'python'>('node');
  const [sending, startSend] = useTransition();
  const [sendError, setSendError] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [jobAction, setJobAction] = useState<{ job: JobRow; operation: QueueAction } | null>(null);
  const [acting, startAction] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const params = queueUrlParams(query);
  const action = `/${locale}/admin/queue`;
  const error = pending ? null : status === "denied" ? t("loadDenied") : status === "failed" ? t("loadError") : null;
  const date = (value: Date | null) => value ? format.dateTime(value, { dateStyle: "short", timeStyle: "medium" }) : "—";
  useEffect(() => {
    if (!owner || pending) return;
    if (error) pushNotification({ id: "queue-load", mode: "error", message: error, brief: true });
    else removeNotification("queue-load");
  }, [owner, pending, error, pushNotification, removeNotification]);
  useEffect(() => {
    if (!autoRefresh || pending) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, queueTiming.refreshMs);
    return () => clearInterval(timer);
  }, [autoRefresh, pending, refresh]);
  function send() {
    if (sending) return;
    setSendError(false);
    const id = pushNotification({ mode: "info", message: t("sending"), pending: true, brief: true });
    startSend(async () => {
      let result: Awaited<ReturnType<typeof testQueue>>;
      try { result = await testQueue({ failures, executor }); } catch { result = { status: "failed" }; }
      pushNotification({ id, mode: result.status === "ok" ? "success" : "error", message: t(result.status === "ok" ? "sent" : "sendFailed"), brief: true });
      if (result.status === "ok") { setTestOpen(false); void refresh(); } else setSendError(true);
    });
  }
  function changeJob() {
    if (!jobAction || acting) return;
    setActionError(null);
    startAction(async () => {
      try {
        const { job, operation } = jobAction;
        const response = await changeQueueJob({ id: job.id, name: job.name, operation, expectedState: job.state, expectedRetryCount: job.retryCount, expectedAdminActionUuid: job.adminActionUuid ?? null });
        if (response.status === 'ok') {
          setJobAction(null); if (operation === 'delete' && selected?.id === job.id) setSelected(null);
          pushNotification({ mode: 'success', message: t('jobActionDone'), brief: true }); void refresh();
        } else setActionError(t(response.status === 'conflict' ? 'jobActionConflict' : response.status === 'inactiveConfig' ? 'jobActionInactiveConfig' : 'jobActionFailed'));
      } catch { setActionError(t('jobActionFailed')); }
    });
  }
  const current = status === "denied" ? null : result?.jobs.find(job => job.id === selected?.id) ?? selected;
  return <TableQuery locale={locale} pathname="/admin/queue" pending={pending}>
    <TableFilters namespace={namespace} action={action} definitions={[{ key: "state", label: t("state"), options: jobStateSchema.options.map(value => ({ value, label: t(`states.${value}`) })) }]}
      values={query.state ? { state: query.state } : {}} preserved={{ limit: params.limit, search: query.search }}
      search={<TableSearch namespace={namespace} action={action} inputId="queue-search" value={query.search} preserved={{ limit: params.limit, ...(query.state ? { state: query.state } : {}) }} />}
      actions={<><Button size="sm" className="h-7 min-h-7 px-2 py-0 text-xs" onClick={() => { setSendError(false); setTestOpen(true); }}><PlayCircle aria-hidden="true" className="size-3.5" />{t("testQueue")}</Button>
        <Button size="icon" tone={autoRefresh ? "primary" : "main-outline"} className="size-7 p-0" aria-label={t("autoRefresh")} aria-pressed={autoRefresh}
          tooltip={t(autoRefresh ? "autoOff" : "autoOn")} tooltipPlacement="bottom" onClick={() => setAutoRefresh(current => !current)}><ArrowRepeat aria-hidden="true" className="size-3.5" /></Button></>}
      refreshButton={<Button size="icon" className="size-7 p-0" disabled={pending} onClick={refresh} tooltip={t("refresh")} tooltipPlacement="bottom" aria-label={t("refresh")}>
        {pending ? <Throbber size="sm" /> : <ArrowClockwise aria-hidden="true" className="size-3.5" />}</Button>} />
    <TableDataRegion label={t("title")}><Table className="[&_th]:py-1 [&_td:not([colspan])]:py-1"><caption className="sr-only">{t("title")}</caption>
      <TableHead><TableRow><TableHeader aria-sort="descending"><span className="inline-flex items-center gap-1">{t("createdAt")}<ChevronDown aria-hidden="true" className="size-3.5" /></span></TableHeader>
        <TableHeader>{t("task")}</TableHeader><TableHeader>{t("state")}</TableHeader><TableHeader>{t("retries")}</TableHeader>
        <TableHeader>{t("nextRunAt")}</TableHeader><TableHeader>{t("completedAt")}</TableHeader><TableHeader actionColumn>{t("rowActions")}</TableHeader>
      </TableRow></TableHead>
      {pending ? <TableLoadingBody colSpan={7} label={t("loadingData")} /> : <TableBody>
        {error && <TableRow><TableCell colSpan={7} className="py-8 text-center"><p role="alert" className="text-error">{error}</p></TableCell></TableRow>}
        {(result?.jobs ?? []).map(job => <TableRow key={job.id}>
          <TableCell className="whitespace-nowrap tabular-nums">{date(job.createdAt)}</TableCell>
          <TableCell><span className="font-mono text-xs">{job.name}{job.executor==='python'?' · Python':''}</span><span className="block font-mono text-[10px] text-muted-foreground">{job.id}</span></TableCell>
          <TableCell><Badge tone={tones[job.state]} className="whitespace-nowrap">{t(`states.${job.state}`)}</Badge></TableCell>
          <TableCell className="tabular-nums">{job.retryCount} / {job.retryLimit}</TableCell>
          <TableCell className="whitespace-nowrap tabular-nums">{["created", "retry"].includes(job.state) ? date(job.nextRunAt) : "—"}</TableCell>
          <TableCell className="whitespace-nowrap tabular-nums">{date(job.completedAt)}</TableCell>
          <TableCell actionColumn><div className="flex items-center justify-end gap-1">
            {(['retry','repeat','cancel','delete'] as const).map(base => {
              const operation = base === 'retry' && job.state === 'cancelled' ? 'resume' : base;
              const Icon = operation === 'retry' ? ArrowClockwise : operation === 'repeat' ? ArrowRepeat : operation === 'resume' ? PlayCircle : operation === 'cancel' ? StopCircle : Trash;
              return <Button key={base} size="icon" className="size-7 p-0" tone={operation === 'delete' ? 'danger-outline' : operation === 'cancel' ? 'warning-outline' : 'main-outline'}
                tooltip={t(`jobActions.${operation}`)} tooltipPlacement="bottom" aria-label={t(`jobActions.${operation}`)} disabled={acting || pending || job.name === DOCUMENT_QUEUE || !queueActionAllowed(operation, job.state)}
                onClick={() => { setActionError(null); setJobAction({ job, operation }); }}><Icon aria-hidden="true" className="size-3.5" /></Button>;
            })}<VerticalDivider/>
            <Button size="icon" tone="main-outline" className="size-7 p-0" tooltip={t("additionalInfo")} tooltipPlacement="bottom"
            aria-label={t("detailsFor", { id: job.id })} onClick={() => setSelected(job)}><InfoCircle aria-hidden="true" className="size-3.5" /></Button>
          </div></TableCell>
        </TableRow>)}
        {!result?.jobs.length && !error && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{t(query.search || query.state ? "noResults" : "empty")}</TableCell></TableRow>}
      </TableBody>}
    </Table></TableDataRegion>
    <TablePaginator locale={locale} namespace={namespace} pathname="/admin/queue" params={params} page={query.page} limit={query.limit} total={result?.total ?? 0}
      rowCount={result?.jobs.length ?? 0} sizes={QUEUE_PAGE_SIZES} unavailable={!result} />
    {current && <PushAside open title={t("additionalInfo")} onClose={() => setSelected(null)}><AsideSection title={t("additionalInfo")} defaultOpen>
      <dl className="space-y-3">{[{ label: "UUID", value: current.id }, { label: t("task"), value: current.name }, { label: t("state"), value: t(`states.${current.state}`) },
        { label: t("retries"), value: `${current.retryCount} / ${current.retryLimit}` }, { label: t("createdAt"), value: date(current.createdAt) },
        { label: t("startedAt"), value: date(current.startedAt) }, { label: t("completedAt"), value: date(current.completedAt) }, { label: t("nextRunAt"), value: date(current.nextRunAt) },
        { label: t("createdBy"), value: current.actorUuid ?? "—" }].map(field => <div key={field.label}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="wrap-anywhere">{field.value}</dd></div>)}</dl>
    </AsideSection></PushAside>}
    {testOpen && <Popup title={t("testQueue")} disableClose={sending} onClose={() => setTestOpen(false)} content={<div className="space-y-3"><p>{t("testDescription")}</p>
      <label className="grid gap-1">{t('executor')}<Select value={executor} disabled={sending} onChange={event=>setExecutor(event.target.value as 'node'|'python')}><option value="node">Node.js</option><option value="python">Python</option></Select></label>
      <label className="grid gap-1">{t("failures")}<Select value={failures} disabled={sending} onChange={event => setFailures(Number(event.target.value))}>
        {[0, 1, 2, 3, 4].map(value => <option key={value} value={value}>{value}</option>)}</Select></label>{sendError && <p role="alert" className="text-error">{t("sendFailed")}</p>}</div>}
      actions={<><Button size="sm" disabled={sending} onClick={() => setTestOpen(false)}>{t("cancel")}</Button><Button size="sm" tone="success-outline" disabled={sending} onClick={send}>{sending ? <Throbber size="sm" /> : t("enqueue")}</Button></>} />}
    {jobAction && <Popup title={t(`jobActions.${jobAction.operation}`)} disableClose={acting} onClose={() => setJobAction(null)}
      content={<div className="space-y-3"><p>{t('jobActionConfirm', { id: jobAction.job.id })}</p><p>{t(`jobActionDescriptions.${jobAction.operation}`)}</p>{actionError && <p role="alert" className="text-danger">{actionError}</p>}</div>}
      actions={<><Button disabled={acting} onClick={() => setJobAction(null)}>{t('cancel')}</Button><Button tone={jobAction.operation === 'delete' ? 'danger-outline' : 'success-outline'} disabled={acting} onClick={changeJob}>{acting ? <Throbber size="sm"/> : t('confirmJobAction')}</Button></>} />}
  </TableQuery>;
}
