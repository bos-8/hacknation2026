"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowClockwise, CheckCircleFill, DashCircle, Download, FiletypeJson, BoxArrowUpRight, InfoCircle, CashCoin, Send, ChevronDown, Trash } from "react-bootstrap-icons";
import { Link, useRouter } from "@/i18n/navigation";
import { formAnalysisFailure, formAnalysisPercent, formAnalysisProgress, hasFormResult, isProcessedForm, type FormAnalysisStage } from "@/schemas/form-upload";
import { Button, Throbber, Tooltip } from "@/ui/basic";
import { Aside } from "@/ui/components/aside";
import { useNotifications } from "@/ui/components/notification-provider";
import { Popup } from "@/ui/components/popup";
import type { FormEntry } from "./workspace";

export function ProcessedStatus({ entry }: { entry: FormEntry }) {
  const t = useTranslations("forms");
  const done = isProcessedForm(entry.processingJson);
  const Icon = done ? CheckCircleFill : DashCircle;
  return <span role="img" aria-label={t(done ? "yes" : "no")} title={t(done ? "yes" : "no")}>
    <Icon aria-hidden="true" className={done ? "size-4 text-success" : "size-4 text-warning"} />
  </span>;
}

const iconLink = "inline-flex size-7 items-center justify-center rounded-md border focus-visible:outline-2 focus-visible:outline-offset-2";

export function FormActions({ entry, active, info, discard }: { entry: FormEntry; active: boolean; info: () => void; discard: () => void }) {
  const t = useTranslations("forms");
  const router = useRouter();
  const { pushNotification } = useNotifications();
  const [savingPayment, setSavingPayment] = useState(false);
  const [refreshingPayment, refreshPayment] = useTransition();
  const [processing, setProcessing] = useState(false);
  const [refreshingProcessing, refreshProcessing] = useTransition();

  const reanalyze = entry.processingJson !== null;
  const analysisAction = t(reanalyze ? "reanalyze" : "sendForProcessing");

  const currentPoll = useRef<AbortController | null>(null);
  const storageKey = "formiq.formJob." + entry.uploaderUuid + "." + entry.id;
  const resume = useEffectEvent((operation: string) => { void processForm(operation); });
  useEffect(() => {
    const operation = sessionStorage.getItem(storageKey);
    if (operation) resume(operation);
    return () => currentPoll.current?.abort();
  }, [storageKey]);

  async function processForm(existing?: string) {
    const controller = new AbortController();
    currentPoll.current = controller;
    setProcessing(true);
    const startedAt = Date.now();
    const id = pushNotification({
      id: "form-process-" + entry.id, mode: "info", message: t(reanalyze ? "reanalyzePending" : "processingPending"),
      brief: true, pending: true, progress: { percent: 0, startedAt },
    });
    let operation = existing || crypto.randomUUID();
    const endpoint = entry.previewUrl + "/process";
    let lastStage: FormAnalysisStage | undefined;
    try {
      const query = new URLSearchParams({ operation, ...(reanalyze && { reanalyze: "1" }) });
      let response = await fetch(endpoint + "?" + query, {
        method: existing ? "GET" : "POST", signal: controller.signal, cache: "no-store",
      });
      let data = await response.json();
      if (response.status === 202 || existing) {
        operation = data.operation ?? operation;
        sessionStorage.setItem(storageKey, operation);
        const statusUrl = endpoint + "?operation=" + encodeURIComponent(operation);
        let misses = 0;
        while (response.ok && data.state !== "completed" && data.state !== "failed") {
          const progress = formAnalysisProgress.safeParse(data.stage ? data : {stage:"queued"});
          if (!progress.success) throw new Error("Invalid progress");
          const {stage, remaining_ms, timeout_remaining_ms} = progress.data;
          if (stage !== lastStage || remaining_ms != null || timeout_remaining_ms != null) {
            const now = Date.now();
            pushNotification({id, mode:"info", pending:true, brief:true,
              message:stage === "queued" ? t("analysisStages.queued") : t("analysisProgress",{stage:t(`analysisStages.${stage}`)}),
              progress:{startedAt,percent:formAnalysisPercent[stage],
                estimatedEndAt:remaining_ms == null ? undefined : now + remaining_ms,
                deadlineAt:timeout_remaining_ms == null ? undefined : now + timeout_remaining_ms}});
            lastStage = stage;
          }
          await new Promise(resolve => setTimeout(resolve, 1200));
          const next = await fetch(statusUrl, {signal:controller.signal,cache:"no-store"}).catch(() => null);
          controller.signal.throwIfAborted();
          if (!next) {
            if (++misses >= 5) throw new Error("Queue status unavailable");
            continue;
          }
          const status = await next.json().catch(() => ({}));
          if (next.status === 503 && !status.state && ++misses < 5) continue;
          response = next;
          data = status;
          misses = 0;
        }
        if (response.ok || data.state === "failed" || response.status === 404) sessionStorage.removeItem(storageKey);
      }
      const { error, mode } = data;
      const errors = new Map<string, string>([
        ["payment_required", "paymentRequired"], ["invalid_sender", "invalidSender"],
        ["format_mismatch", "formatMismatch"],
        ["reference_material_not_form", "referenceDocument"],
        ["analysis_changed", "analysisChanged"], ["reanalyze_unavailable", "reanalyzeUnavailable"],
        ["eden_not_configured", "providerNotConfigured"], ["eden_ocr_failed", "providerOcrFailed"],
        ["eden_upload_failed", "providerUploadFailed"], ["eden_llm_failed", "providerLlmFailed"],
        ["eden_llm_invalid_json", "providerInvalidJson"], ["eden_timeout", "providerTimeout"],
        ["eden_invalid_text", "providerInvalidText"],
        ["local_llm_failed", "localLlmFailed"], ["local_llm_document_unsupported", "localLlmUnsupported"],
        ["document_text_failed", "documentTextFailed"], ["worker_intake_timeout", "workerIntakeTimeout"],
        ["worker_response_timeout", "workerResponseTimeout"], ["worker_disconnected", "workerDisconnected"],
        ["worker_invalid_result", "workerInvalidResult"],
        ["ocr_only_format_unsupported", "ocrOnlyFormatUnsupported"], ["ocr_only_no_fields", "ocrOnlyNoFields"],
        ["pipeline_unavailable", "pipelineUnavailable"], ["pipeline_read_failed", "pipelineReadFailed"],
        ["pipeline_llm_failed", "pipelineLlmFailed"], ["pipeline_invalid_json", "pipelineInvalidJson"],
        ["pipeline_timeout", "pipelineTimeout"],
      ]);
      const savedMessage = mode === "pipeline" ? "pipelineSucceeded"
        : mode === "eden" ? (reanalyze ? "reanalyzeSucceeded" : "providerSucceeded") : "processingSucceeded";
      const failure = formAnalysisFailure.safeParse(data).data;
      const outputLimited = failure?.reason === "output_limit";
      const message = response.ok ? savedMessage
        : outputLimited ? "analysisReasons.output_limit"
          : errors.get(error) ?? (response.status === 415 ? "invalid" : response.status === 429 ? "workerBusy" : "processingFailed");
      const parts = [t(message)];
      const phase = outputLimited ? "llm" : failure?.phase ?? lastStage;
      if (!response.ok && phase) {
        parts.push(t("analysisFailureStage", { stage: t(`analysisStages.${phase}`) }));
      }
      if (!response.ok && failure?.reason && !outputLimited) {
        const reason = failure.reason;
        if (reason.startsWith("http_")) {
          const status = reason.slice(5);
          const explanations = { "400": "invalidRequest", "401": "providerAuth", "402": "providerBilling",
            "403": "providerAuth", "404": "modelUnavailable", "408": "providerWait", "413": "providerLimit",
            "415": "formatRejected", "422": "invalidRequest", "429": "rateLimit", "504": "providerWait" } as Record<string, string>;
          const explanation = explanations[status] ?? (status.startsWith("5") ? "providerService" : "providerRejected");
          parts.push(t("analysisFailureHttp", { status, reason: t(`analysisReasons.${explanation}`) }));
        } else if (reason === "deadline") {
          if (failure.timeoutSeconds) parts.push(t("analysisDeadline", { seconds: failure.timeoutSeconds }));
        } else {
          parts.push(t(`analysisReasons.${reason}`));
        }
      }
      pushNotification({
        id, mode: response.ok ? "success" : "error", message: parts.join(" "), brief: true,
        progress: response.ok ? { percent: 100, startedAt } : undefined,
      });
      if (response.ok || error === "analysis_changed") refreshProcessing(() => router.refresh());
    } catch {
      if (controller.signal.aborted) return;
      pushNotification({ id, mode: "error", message: t("processingFailed"), brief: true });
    } finally {
      if (!controller.signal.aborted) setProcessing(false);
    }
  }
  async function togglePayment() {
    setSavingPayment(true);
    const paid = !entry.paid;
    const id = pushNotification({ mode: "info", message: t("paymentPending"), brief: true, pending: true });
    try {
      const response = await fetch(entry.previewUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid }),
      });
      if (!response.ok) throw new Error("payment update failed");
      pushNotification({ id, mode: "success", message: t(paid ? "paymentMarked" : "paymentUnmarked"), brief: true });
      refreshPayment(() => router.refresh());
    } catch {
      pushNotification({ id, mode: "error", message: t("paymentFailed"), brief: true });
    }
    finally { setSavingPayment(false); }
  }
  const name = entry.file.name;
  const paymentAction = entry.paid ? "unmarkPaid" : "markPaid";
  return <div className="flex items-center justify-end gap-1">
    <Button size="icon" tone="ghost" className={`size-7 p-0 form-action-outline ${entry.paid ? "form-action-red" : "form-action-green"}`}
      disabled={savingPayment || refreshingPayment} aria-pressed={entry.paid}
      aria-label={t(`${paymentAction}Named`, { name })} tooltip={t(paymentAction)}
      tooltipPlacement="bottom" onClick={togglePayment}>
      <CashCoin aria-hidden="true" />
    </Button>
    <Button size="icon" tone="ghost" className={`size-7 p-0 form-action-outline form-action-gold`} onClick={() => void processForm()}
      disabled={processing || refreshingProcessing} aria-label={analysisAction}
      tooltip={analysisAction} tooltipPlacement="bottom">
      {processing ? <Throbber size="sm" /> : reanalyze ? <ArrowClockwise aria-hidden="true" /> : <Send aria-hidden="true" />}
    </Button>
    {hasFormResult(entry.processingJson) ? <Link href={`/forms/${entry.id}`} className={`${iconLink} form-action-outline form-action-sky`}
      aria-label={t("openNamed", { name })} title={t("details")}><BoxArrowUpRight aria-hidden="true" /></Link>
      : <Button size="icon" tone="ghost" className={`size-7 p-0 form-action-outline form-action-sky`} disabled
          aria-label={t("openNamed", { name })} tooltip={t("awaitingProcessing")} tooltipPlacement="bottom">
          <BoxArrowUpRight aria-hidden="true" />
        </Button>}
    <Tooltip content={t("downloadOriginal")} placement="bottom">
      <a href={`${entry.previewUrl}?download=1`} download={name}
        className={`${iconLink} form-action-outline form-action-green`}
        aria-label={t("downloadOriginalNamed", { name })}><Download aria-hidden="true" /></a>
    </Tooltip>
    {hasFormResult(entry.processingJson) ? <Tooltip content={t("download")} placement="bottom">
      <a download={`${name}.json`} className={`${iconLink} form-action-outline form-action-green`}
        href={`${entry.previewUrl}?result=1`}
        aria-label={t("downloadNamed", { name })}><FiletypeJson aria-hidden="true" /></a>
    </Tooltip> : <Button size="icon" tone="ghost" className="size-7 p-0 form-action-outline form-action-green" disabled
        aria-label={t("downloadNamed", { name })} tooltip={t("awaitingProcessing")} tooltipPlacement="bottom">
        <FiletypeJson aria-hidden="true" />
      </Button>}
    <Button size="icon" tone="ghost" className={`size-7 p-0 form-action-outline form-action-orange`} onClick={discard} aria-label={t("removeNamed", { name })} tooltip={t("remove")}><Trash aria-hidden="true" /></Button>
    <Button size="icon" tone="ghost" className={`ms-1 size-7 p-0 form-action-outline form-action-blue form-action-info`}
      aria-expanded={active} aria-controls={active ? "form-info" : undefined} tooltipPlacement="bottom" onClick={info} aria-label={t("infoNamed", { name })} tooltip={t("info")}><InfoCircle aria-hidden="true" /></Button>
  </div>;
}

export function FormInfo({ entry, close }: { entry: FormEntry; close: () => void }) {
  const t = useTranslations("forms");
  const format = useFormatter();
  const date = (ms: number) => format.dateTime(ms, { dateStyle: "medium", timeStyle: "medium" });
  const fields = [
    [t("name"), entry.file.name], [t("id"), entry.id],
    [t("uploaded"), date(entry.uploadedAt)], [t("modified"), date(entry.file.lastModified)],
    [t("type"), entry.result.media_type], [t("size"), format.number(entry.result.size_bytes, {style:"unit", unit:"byte"})],
    [t("paid"), t(entry.paid ? "yes" : "no")], [t("result"), t("valid")], [t("processed"), t(isProcessedForm(entry.processingJson) ? "yes" : "no")],
  ];
  return <Aside id="form-info" open variant="push" onClose={close} title={t("info")} description={entry.file.name}
    icon={<InfoCircle className="text-warning" aria-hidden="true" />}>
    <FormUploader key={entry.id} entry={entry} />
    <dl className="divide-y divide-panel-border px-4">{fields.map(([label, value]) =>
      <div key={label} className="py-2"><dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="break-words text-sm font-medium">{value}</dd></div>)}</dl>
  </Aside>;
}

function FormUploader({ entry }: { entry: FormEntry }) {
  const t = useTranslations("forms");
  const detailsId = useId();
  const [person, setPerson] = useState<{ name: string; email: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggleDetails() {
    if (person) {
      setOpen(current => !current);
      return;
    }
    setOpen(true);
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/v1/forms/${entry.id}/uploader`);
      if (!response.ok) throw new Error("Uploader details unavailable");
      setPerson(await response.json());
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return <section className="space-y-2 border-b border-panel-border px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{t("uploaderUuid")}</p>
        <p className="break-all font-mono text-xs">{entry.uploaderUuid}</p>
      </div>
      <Button size="sm" tone="main-outline" aria-expanded={open} aria-controls={detailsId}
        disabled={pending} onClick={toggleDetails}>
        {t(person ? open ? "hideUploaderDetails" : "showUploaderDetails" : "loadUploaderDetails")}
        <ChevronDown aria-hidden="true" className={open ? "rotate-180" : undefined} />
      </Button>
    </div>
    <div id={detailsId} hidden={!open} className="rounded-md border border-panel-border px-3 py-2 text-sm">
      {pending && <Throbber size="sm" label={t("loadingUploaderDetails")} />}
      {failed && <p role="alert">{t("uploaderDetailsFailed")}</p>}
      {person && <dl className="space-y-2">
        <div><dt className="text-xs text-muted-foreground">{t("uploaderName")}</dt><dd className="break-words">{person.name}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{t("uploaderEmail")}</dt><dd className="break-words">{person.email}</dd></div>
      </dl>}
    </div>
  </section>;
}

export function ConfirmRemove({ entry, close, confirm }: { entry: FormEntry; close: () => void; confirm: () => Promise<void> }) {
  const t = useTranslations("forms");
  const { pushNotification } = useNotifications();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function submit() {
    setPending(true);
    setFailed(false);
    const id = pushNotification({ mode: "info", message: t("deletePending"), brief: true, pending: true });
    try {
      await confirm();
      pushNotification({ id, mode: "success", message: t("deleted"), brief: true });
    } catch {
      pushNotification({ id, mode: "error", message: t("deleteFailed"), brief: true });
      setFailed(true);
      setPending(false);
    }
  }
  return <Popup title={t("remove")} onClose={close} disableClose={pending}
    content={<>{t("confirmRemove", { name: entry.file.name })}{failed && <p role="alert">{t("deleteFailed")}</p>}</>}
    actions={<><Button disabled={pending} onClick={close}>{t("cancel")}</Button><Button disabled={pending} tone="error" onClick={submit}>{t("remove")}</Button></>} />;
}
