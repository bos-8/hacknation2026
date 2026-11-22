"use client";

import { useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, Clipboard, Download } from "react-bootstrap-icons";
import { Link } from "@/i18n/navigation";
import { needsRuleAnalysis } from "@/schemas/answer-editor";
import { exportForm, hasFormResult, type FormProcessingResult } from "@/schemas/form-upload";
import { Button, Heading } from "@/ui/basic";
import { CodeJson } from "@/ui/components/code-json";
import { useForms, type FormEntry } from "../workspace";
import { AnswerEditor } from "./answer-editor";
import { PdfPreview } from "./pdf-preview";
import { SemanticReview } from "./semantic-review";

function FormResult({ entry, result }: { entry: FormEntry; result: FormProcessingResult }) {
  const t = useTranslations("forms");
  const formatter = useFormatter();
  const [copyStatus, setCopyStatus] = useState<"jsonCopied" | "jsonCopyFailed">();
  const [hovered, setHovered] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [imageRatio, setImageRatio] = useState(1);
  const [showContent, setShowContent] = useState(false);
  const [page, setPage] = useState(1);
  const [showIr, setShowIr] = useState(false);
  const [view, setView] = useState<"json" | "form">("json");
  const [editorOpened, setEditorOpened] = useState(false);
  const json = useRef<HTMLElement>(null);
  const active = hovered ?? selected;
  const mime = entry.result.media_type;
  const resultLocations = result.mode === "pipeline" ? result.field_locations : undefined;
  const resultConfidences = result.mode === "pipeline" ? result.field_confidences : undefined;
  const ir = result.mode === "pipeline" ? result.form_ir : undefined;
  const score = resultConfidences?.find(item => item.field_id === active);
  const fields = useMemo(() => fieldNames(result), [result]);
  const displayed = useMemo(() => exportForm(result, true), [result]);
  const percentage = (value: number) => formatter.number(value, { style: "percent", maximumFractionDigits: 1 });

  async function copyJson() {
    setCopyStatus(undefined);
    try {
      await navigator.clipboard.writeText(JSON.stringify(displayed, null, 2));
      setCopyStatus("jsonCopied");
    } catch {
      setCopyStatus("jsonCopyFailed");
    }
  }

  function showField(id?: string) {
    if (!id) return;
    const field = resultLocations?.find(item => item.field_id === id);
    const regions = field ? [...field.label, ...field.input] : [];
    if (regions.length && !regions.some(region => region.page === page)) setPage(regions[0].page);
  }

  function fromSource(id?: string) {
    setHovered(id);
    if (!id) return;
    const target = json.current?.querySelector<HTMLElement>(`code [data-field-id="${id}"]`);
    const viewport = target?.closest("pre");
    if (!target || !viewport) return;
    const rect = target.getBoundingClientRect();
    const bounds = viewport.getBoundingClientRect();
    if (rect.top < bounds.top || rect.bottom > bounds.bottom) viewport.scrollTop += rect.top - bounds.top;
  }

  const regions = <div className="pointer-events-none absolute inset-0">
    {resultLocations?.map(location => (["label", "input"] as const).flatMap(kind =>
      location[kind].filter(region => region.page === page).map(({ bbox: [x0, y0, x1, y1] }, index) =>
        <button key={`${location.field_id}-${kind}-${index}`} type="button"
          aria-label={`${fields.get(location.field_id)} · ${t(kind === "label" ? "labelCoordinates" : "inputCoordinates")}`}
          onMouseEnter={() => fromSource(location.field_id)} onMouseLeave={() => fromSource()}
          onFocus={() => fromSource(location.field_id)} onBlur={() => fromSource()}
          onClick={() => setSelected(location.field_id)}
          className={`pointer-events-auto absolute rounded-xs border-2 ${active === location.field_id
            ? "border-red-600 bg-red-500/20"
            : active ? "border-transparent"
              : kind === "label" ? "border-sky-600 bg-sky-500/10" : "border-emerald-600 bg-emerald-500/10"}`}
          style={{ left: `${x0 * 100}%`, top: `${y0 * 100}%`,
            width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` }} />,
      ),
    ))}
  </div>;

  return <div className="grid gap-4 lg:grid-cols-2">
    <section className="glass-panel min-w-0 overflow-hidden">
      <Heading level={2} className="border-b border-panel-border p-4 text-lg">{t("original")}</Heading>
      {!!resultLocations?.length && <div className="space-y-2 p-3 text-sm">
        <label className="flex flex-wrap items-center gap-2">
          <span>{t("highlightField")}</span>
          <select value={selected ?? ""} onChange={event => {
            const id = event.target.value || undefined;
            setSelected(id);
            showField(id);
          }} className="min-w-0 max-w-full rounded-md border border-panel-border bg-panel px-2 py-1">
            <option value="">{t("allCoordinates")}</option>
            {resultLocations.map(({ field_id }) => <option key={field_id} value={field_id}>{fields.get(field_id)}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span><span aria-hidden="true" className="mr-1 inline-block size-2.5 rounded-sm bg-sky-600" />{t("labelCoordinates")}</span>
          <span><span aria-hidden="true" className="mr-1 inline-block size-2.5 rounded-sm bg-emerald-600" />{t("inputCoordinates")}</span>
        </div>
      </div>}
      {mime === "application/pdf" ? <PdfPreview src={entry.previewUrl} name={entry.file.name} page={page} onPage={setPage}>
        {regions}
      </PdfPreview> : mime.startsWith("image/") ? <div className="flex justify-center">
        <div className="relative" style={{width: `min(100%, ${70 * imageRatio}vh)`}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={entry.previewUrl} alt={entry.file.name} className="block h-auto w-full" onLoad={event => setImageRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} />
          {regions}
        </div>
      </div> : ["text/plain", "application/json"].includes(mime)
        ? <iframe sandbox="" src={entry.previewUrl} title={entry.file.name} className="h-[65vh] w-full" />
        : <div className="space-y-2 p-4"><p className="break-words">{entry.file.name}</p>
          <a download={entry.file.name} href={entry.previewUrl} className="text-primary underline">{t("downloadOriginal")}</a>
        </div>}
    </section>
    <section ref={json} className="glass-panel min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-panel-border p-4">
        <Heading level={2} className="text-lg">{t(view === "form" ? "formPreview" : "json")}</Heading>
        <div className="flex flex-wrap items-center gap-2">
          {result.mode === "pipeline" && <Button type="button" size="sm" tone="main-outline" onClick={() => {
            setEditorOpened(true);
            setView(view === "json" ? "form" : "json");
          }}>{t(view === "json" ? "openPreview" : "showJson")}</Button>}
          <a download href={entry.previewUrl + "?result=1&answers=1"} className="inline-flex items-center gap-1 rounded-md border border-primary px-3 py-1 text-sm text-primary hover:bg-primary hover:text-white">
            <Download aria-hidden="true" />{t("download")}
          </a>
          <Button type="button" size="sm" tone="main-outline" onClick={() => void copyJson()}>
            <Clipboard aria-hidden="true" className="size-4" />
            {t("copyJson")}
          </Button>
        </div>
        <span role="status" className={copyStatus ? "w-full text-sm" : "sr-only"}>
          {copyStatus && t(copyStatus)}
        </span>
      </div>
      <div hidden={view !== "json"}>
        {ir && <div className="space-y-2 border-b border-panel-border p-4 text-sm">
          <p className="font-medium">{t(`profileStatus.${ir.procedure.status}`)}</p>
          {ir.extended && <SemanticReview id={entry.id} revision={entry.file.lastModified} profile={ir.extended} />}
          {ir.procedure.candidates.map(profile => <div key={profile.id}>
            <strong>{profile.label}</strong>
            <ul className="ml-5 list-disc">{profile.releaseGates.map(gate => <li key={gate}>{gate}</li>)}</ul>
          </div>)}
          <details onToggle={event => setShowIr(event.currentTarget.open)}>
            <summary className="cursor-pointer">{t("formIr")}</summary>
            {showIr && <CodeJson value={ir} className="mt-2 max-h-80 p-2" />}
          </details>
        </div>}
        {!!resultConfidences?.length && <p className="min-h-10 border-b border-panel-border px-4 py-2 text-sm tabular-nums">
          {score ? t("qwenConfidence", { score: percentage(score.confidence) }) : t("confidenceHint")}
          {score?.ocr_confidence != null && <> · {t("ocrConfidence", { score: percentage(score.ocr_confidence) })}</>}
        </p>}
        {result.mode === "pipeline" && result.document_content && <details className="border-t border-panel-border p-4"
          onToggle={event => setShowContent(event.currentTarget.open)}>
          <summary className="cursor-pointer">{t("documentContent")}</summary>
          <Button size="sm" type="button" tone="main-outline" onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(result.document_content, null, 2)], {type:"application/json"}));
            const link = document.createElement("a");
            link.href = url; link.download = entry.file.name + ".content.json"; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>{t("downloadContent")}</Button>
          {showContent && <CodeJson value={result.document_content} className="mt-2 max-h-80 p-2" />}
        </details>}
        <CodeJson value={displayed} fields={fields} activeId={active}
          onActive={id => { setHovered(id); showField(id); }} className="max-h-[65vh] p-4" />
        {resultLocations && resultLocations.length > 0 && <details className="border-t border-panel-border p-4">
          <summary className="cursor-pointer text-sm font-medium">{t("fieldCoordinates")}</summary>
          <CodeJson value={resultLocations} fields={fields} activeId={active}
            onActive={id => { setHovered(id); showField(id); }} className="mt-2 max-h-64 p-1 text-xs" />
        </details>}
        {!!resultConfidences?.length && <details className="border-t border-panel-border p-4">
          <summary className="cursor-pointer text-sm font-medium">{t("fieldConfidences")}</summary>
          <CodeJson value={resultConfidences} fields={fields} activeId={active}
            onActive={id => { setHovered(id); showField(id); }} className="mt-2 max-h-64 p-1 text-xs" />
        </details>}
      </div>
      <div hidden={view !== "form"}>
        {editorOpened && result.mode === "pipeline" && (needsRuleAnalysis(result)
        ? <p className="col-span-full">{t("answers.reanalyze")}</p>
        : <AnswerEditor key={[result.processed_at, result.answer_revision, ir?.extended?.candidates.filter(c => c.resolution).length].join(":")}
            id={entry.id} revision={entry.file.lastModified} result={result} />)}
      </div>
    </section>
  </div>;
}

function fieldNames(result: FormProcessingResult): ReadonlyMap<string, string> {
  if (result.mode !== "pipeline") return new Map();
  const ids = new Set([
    ...result.field_locations.map(item => item.field_id),
    ...(result.field_confidences ?? []).map(item => item.field_id),
  ]);
  return new Map(result.draft.tabs.flatMap(tab => tab.questions.flatMap(
    section => section.field.repeatingSectionGrid
      .filter(({ field }) => ids.has(field.id))
      .map(({ field }) => [field.id, field.title] as const),
  )));
}

export default function FormDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("forms");
  const entry = useForms().entries.find(item => item.id === id);
  return <div className="glass-shell mx-auto min-w-0 space-y-4 pb-8 pt-6 sm:pt-8">
    <header className="glass-panel space-y-2 p-5 sm:p-6">
      <Link href="/forms" className="glass-accent-text inline-flex items-center gap-2 text-sm font-medium hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />{t("back")}
      </Link>
      <Heading level={1} className="break-words text-2xl leading-tight tracking-tight sm:text-3xl">
        {entry?.processingJson?.draft.title || entry?.file.name || t("detailsTitle")}
      </Heading>
    </header>
    {entry?.processingJson && hasFormResult(entry.processingJson)
      ? <FormResult key={entry.id} entry={entry} result={entry.processingJson} />
      : <p className="glass-panel p-4 text-muted-foreground sm:p-6">{t(entry ? "awaitingProcessing" : "missing")}</p>}
  </div>;
}
