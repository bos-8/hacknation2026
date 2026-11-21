"use client";

import { PdfToolbar } from "../pdf-toolbar";
import { StageProgress } from "../stage-progress";
import { OriginalDocument } from "../original-document";
import { useHydrated } from "@/ui/components/use-hydrated";

import { useRef, useState, type PointerEvent } from "react";
import { ArrowClockwise, Check2, Pencil, Play, Save, BoundingBoxCircles, BoxArrowUpRight, FileEarmarkRichtext, Fonts, ShieldLock } from "react-bootstrap-icons";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { API_ROUTES } from "@/config/api-routes";
import { Badge, Button, Heading, Input, Select, Throbber } from "@/ui/basic";
import { cx } from "@/ui/basic/styles";
import { labels, type ReviewMode, type ReviewPage, type RunView } from "@/schemas/document-review";

import { getAnalysis, changeReview } from "../actions";
import { tableStyles } from "@/ui/components/styles";
import { Transcript, isSelected, type WordSelection, type WordLayer } from "./transcript";

const panes = ["source", "ocr", "redacted"] as const;
type Pane = typeof panes[number];
const paneIcons = { source: FileEarmarkRichtext, ocr: Fonts, redacted: ShieldLock };

function PageImage({ src, title, page, selected, select }: WordLayer & { src: string; title: string }) {
  const start = useRef<number | null>(null);
  function wordAt(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * page.width / rect.width;
    const y = (event.clientY - rect.top) * page.height / rect.height;
    return page.words.findIndex(({ box: [left, top, right, bottom] }) =>
      x >= left && x <= right && y >= top && y <= bottom);
  }
  function extend(event: PointerEvent<HTMLDivElement>) {
    if (start.current === null) return;
    const index = wordAt(event);
    if (index >= 0) select([start.current, index]);
  }
  return <div className="relative w-full cursor-text select-none" style={{ aspectRatio: `${page.width}/${page.height}` }}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return;
      const index = wordAt(event);
      window.getSelection()?.removeAllRanges();
      if (index < 0) { select(null); return; }
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = index;
      select([index, index]);
    }} onPointerMove={extend} onPointerUp={event => { extend(event); start.current = null; }}
    onLostPointerCapture={() => { start.current = null; }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={title} draggable={false} className="absolute inset-0 size-full" />
    {page.words.map(({ box: [x, y, r, b] }, i) => isSelected(i, selected) &&
      <span key={i} aria-hidden="true" data-selected data-word={i}
        className="pointer-events-none absolute bg-amber-400/35 outline outline-amber-600"
        style={{ left: x/page.width*100+"%", top: y/page.height*100+"%", width: (r-x)/page.width*100+"%", height: (b-y)/page.height*100+"%" }} />)}
  </div>;
}

type Props = { file: string; version: number; name: string; mode: ReviewMode; run?: RunView | null;
  pending: boolean; error: boolean; refresh: () => void;
  act: (action: () => Promise<{ status: string; activityId?: string }>, onSuccess?: () => void) => void };
type Draft = { revision: number; page: ReviewPage; correctText?: boolean };

export function DocumentComparison({ file, version, name, mode, run, pending, error, refresh, act }: Props) {
  const t = useTranslations("common.documentCompare");
  const review = useTranslations("common.documentReview");
  const router = useRouter();
  const hydrated = useHydrated();
  const [hidden, setHidden] = useState<Pane[]>([]);
  const [variant, setVariant] = useState<"black" | "labels">("black");
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, select] = useState<WordSelection>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drawing, setDrawing] = useState(false);
  const anchor = useRef<[number, number] | null>(null);
  const page = draft?.page ?? run?.pages[pageIndex];
  const wordIndex = selected?.[1];
  const word = wordIndex !== undefined && page?.words[wordIndex];
  const processing = run?.stage === "ocr" || run?.stage === "detect";
  const editable = !pending && (run?.stage === "ocr_review" || run?.stage === "review");
  function updatePage(next: ReviewPage) {
    if (run && editable) setDraft({ revision: draft?.revision ?? run.revision, page: next });
  }
  function updateWord(index: number, patch: Partial<ReviewPage["words"][number]>) {
    if (page) updatePage({ ...page, words: page.words.map((value, i) => i === index ? { ...value, ...patch } : value) });
  }
  function correctText(index: number, text: string) {
    if (!run || !page || pending) return;
    if (run.stage === "ocr_review") { updateWord(index, { text }); return; }
    if (!["review", "approved"].includes(run.stage) || (draft && !draft.correctText)) return;
    const words = page.words.map((word, i) => i === index ? { ...word, text } : word);
    const unchanged = words.every((word, i) => word.text === run.pages[pageIndex]?.words[i]?.text);
    setDraft(unchanged ? null : { page: { ...page, words }, revision: draft?.revision ?? run.revision, correctText: true });
  }
  function change(command: Parameters<typeof changeReview>[2]) {
    if (!run) return;
    const changes = command === "rerun" ? { index: pageIndex } : draft ? { index: pageIndex, page: draft.page } : undefined;
    act(() => changeReview(run.uuid, draft?.revision ?? run.revision, command, changes), () => { setDraft(null); setDrawing(false); });
  }
  function coords(e: PointerEvent<HTMLDivElement>): [number, number] {
    const bounds = e.currentTarget.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(1, (e.clientX-bounds.left)/bounds.width)) * page!.width),
      Math.round(Math.max(0, Math.min(1, (e.clientY-bounds.top)/bounds.height)) * page!.height)];
  }
  const original = API_ROUTES.fileDownload.replace("{uuid}", file) + `?version=${version}&preview=1`;
  const preview = run && API_ROUTES.ocrPreview.replace("{uuid}", run.uuid).replace("{page}", String(pageIndex)) + `?revision=${run.revision}`;
  const redacted = run?.stage === "approved" || run?.stage === "review";
  const layer = page && { page, selected, select };

  const available = panes.filter(pane => pane !== "redacted" || redacted);
  const visible = available.filter(pane => !hidden.includes(pane));
  const displayed: Pane[] = visible.length ? visible : ["source"];
  return <article className="min-w-0 space-y-3">
    <header className="flex flex-wrap items-center gap-2">
      <Heading level={2} className="min-w-0 wrap-anywhere text-xl">{name}</Heading><Badge tone="neutral">v{version}</Badge>
    </header>
    <div className={cx(tableStyles.toolbar, "flex-wrap rounded-lg border border-border bg-card py-2")}>
      <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm">{review("mode")}
        <Select className="w-auto max-w-full" aria-label={review("mode")} value={mode} disabled={!hydrated || !!draft || pending}
          onChange={e => router.replace({ pathname: `/admin/files/ocr/${file}`, query: { version, mode: e.target.value } })}>
          <option value="manual">{review("manual")}</option><option value="auto">{review("auto")}</option>
        </Select>
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {run === undefined && <Throbber size="sm" />}
        {run === null && <Button size="sm" tone="primary" disabled={pending} onClick={() => act(() => getAnalysis(file, version, mode, true))}><Play />{review("start")}</Button>}
        {run?.stage.endsWith("_failed") && <Button size="sm" disabled={pending} onClick={() => change("retry")}><ArrowClockwise />{review("retry")}</Button>}
        {run?.stage === "ocr_review" && <Button size="sm" disabled={pending || !!draft} onClick={() => change("rerun")}><ArrowClockwise />{review("rerun")}</Button>}
        {run && (["ocr_review", "review"].includes(run.stage) || draft?.correctText) && <>
          {!draft?.correctText && <Button size="sm" disabled={pending || !page} aria-pressed={drawing} onClick={() => { setHidden(old => old.filter(p => p !== "source")); setDrawing(!drawing); }}><BoundingBoxCircles />{review("region")}</Button>}
          <Button size="sm" disabled={pending || !draft} onClick={() => change(draft?.correctText ? "edit" : "save")}><Save />{review("save")}</Button>
          {draft && <Button size="sm" disabled={pending} onClick={() => { setDraft(null); select(null); setDrawing(false); }}>{review("discard")}</Button>}
          {!draft?.correctText && <Button size="sm" tone="primary" disabled={pending} onClick={() => change("approve")}><Check2 />{review(run.stage === "ocr_review" ? "approveOcr" : "approve")}</Button>}
        </>}
        {redacted && <Button size="sm" disabled={pending || !!draft || run?.exports.some(job => job.stage === "queued")} onClick={() => change("edit")}><Pencil />{review("editOcr")}</Button>}
      </div>
    </div>
    {draft?.correctText && <p role="status" className="text-sm text-muted-foreground">{t("recheck")}</p>}
    {error && <p role="alert" className="flex items-center gap-2 text-sm text-error">{review("error")} <Button size="sm" onClick={refresh}>{review("refresh")}</Button></p>}
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t("columns")} className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs font-medium text-muted-foreground">{t("columns")}</span>
        {available.map(pane => {
          const Icon = paneIcons[pane];
          return <Button key={pane} size="sm" aria-pressed={displayed.includes(pane)}
          tone={displayed.includes(pane) ? "primary" : "main-outline"} disabled={displayed.length === 1 && displayed.includes(pane)}
          onClick={() => setHidden(displayed.includes(pane) ? [...hidden, pane] : hidden.filter(p => p !== pane))}>
          <Icon aria-hidden="true" />{t(pane)}
        </Button>})}
      </div>
      {run && run.pages.length > 0 && <label className="flex items-center gap-2 text-sm sm:ml-auto">{review("page")} <Select aria-label={review("page")} className="w-auto" disabled={!hydrated || !!draft || pending} value={pageIndex} onChange={e => {
        setPageIndex(Number(e.target.value)); select(null); setDrawing(false); window.getSelection()?.removeAllRanges();
      }}>{run.pages.map((_, i) => <option key={i} value={i}>{i + 1} / {run.pages.length}</option>)}</Select></label>}
    </div>
    <PdfToolbar run={run} onChange={refresh} disabled={!!draft} />
    {run && (processing ? <StageProgress label={review(run.stage)} percent={run.stage === "ocr" ? run.ocrProgress : null} timing={run} />
      : <p role="status" className="text-sm text-muted-foreground">{review(run.stage)}</p>)}
    {run?.detector && <p className="text-xs text-muted-foreground">{review("detector")} · {run.detector === "pii-tracer+pl" ? "PII-Tracer + PL" : review("rules")}</p>}
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3">
      {displayed.map(pane => <section key={pane} data-compare-pane={pane}
        aria-label={t(pane)} className="min-w-0 self-start overflow-hidden rounded-md border border-border">
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-1">
          <h3 className="text-sm font-semibold">{t(pane)}</h3>
          {pane === "source" && <a className="inline-flex items-center gap-1 text-xs text-primary underline" href={original} target="_blank" rel="noopener noreferrer">{t("fullSize")}<BoxArrowUpRight aria-hidden="true" /></a>}
          {pane === "redacted" && redacted && <Select aria-label={t("variant")} className="w-auto max-w-full text-xs" value={variant}
            onChange={e => setVariant(e.target.value === "labels" ? "labels" : "black")}>
            <option value="black">{t("black")}</option><option value="labels">{t("labels")}</option>
          </Select>}
        </header>
        {pane === "source" && (layer && preview ? <div style={drawing ? { cursor: "crosshair", touchAction: "none" } : undefined}
          onPointerDownCapture={e => {
            if (!drawing || !e.isPrimary || e.button !== 0) return;
            e.stopPropagation(); anchor.current = coords(e); e.currentTarget.setPointerCapture(e.pointerId);
          }} onPointerCancel={() => { anchor.current = null; }} onPointerUpCapture={e => {
            if (!drawing || !anchor.current || !page) return;
            e.stopPropagation();
            const [x,y] = anchor.current, [r,b] = coords(e);
            anchor.current = null;
            if (x === r || y === b) return;
            updatePage({ ...page, words: [...page.words, { text: "", label: run?.stage === "review" ? "DANE" : "",
              box: [Math.min(x,r),Math.min(y,b),Math.max(x,r),Math.max(y,b)] }] });
            select([page.words.length, page.words.length]); setDrawing(false);
          }}><PageImage {...layer} src={preview} title={name} /></div> : <OriginalDocument name={name} src={original} />)}
        {pane === "ocr" && (layer && page?.words.length && run ? <Transcript key={pageIndex} {...layer} revision={run.revision}
          editable={!pending && (run.stage === "ocr_review" || (redacted && (!draft || !!draft.correctText)))} updateText={correctText} /> :
          <p className="p-3 text-sm">{layer ? review("empty") : t("noOcr")}</p>)}
        {pane === "redacted" && (redacted && layer && preview ? <>
          {run.stage === "review" && <p className="px-2 py-1 text-xs">{t(draft ? "savePreview" : "draft")}</p>}
          <PageImage {...layer} src={preview + "&variant=" + variant} title={t(variant)} />
        </> : <p className="p-3 text-sm">{t("noRedaction")}</p>)}
      </section>)}
    </div>
    {editable && !draft?.correctText && page && word && wordIndex !== undefined && <div className="flex flex-wrap items-center gap-3 text-sm">
      {run?.stage === "review" && <label>{review("mask")} <Select className="w-auto" value={word.label}
        onChange={e => updateWord(wordIndex, { label: e.target.value as typeof word.label })}>
        {labels.map(label => <option key={label} value={label}>{label || review("visible")}</option>)}</Select></label>}
      {word.confidence != null && <span>{review("confidence")} · {Math.round(word.confidence)}/100</span>}
      <details><summary className="cursor-pointer">{review("box")}</summary>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{word.box.map((value, i) => <label key={i}>
          {["x₁", "y₁", "x₂", "y₂"][i]}<Input type="number" min={0} max={i % 2 ? page.height : page.width} value={value} onChange={e => {
            const box: typeof word.box = [...word.box]; box[i] = Number(e.target.value); updateWord(wordIndex, { box });
          }} /></label>)}</div></details>
    </div>}
  </article>;
}
