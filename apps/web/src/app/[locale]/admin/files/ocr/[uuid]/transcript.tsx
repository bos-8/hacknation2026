"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ReviewPage } from "@/schemas/document-review";

export type WordSelection = [number, number] | null;
export type WordLayer = { page: ReviewPage; selected: WordSelection; select: (selection: WordSelection) => void };
export function isSelected(index: number, selection: WordSelection) {
  return !!selection && index >= Math.min(...selection) && index <= Math.max(...selection);
}

export function Transcript({ page, selected, select, editable, revision, updateText }: WordLayer & {
  editable: boolean; revision: number; updateText: (index: number, text: string) => void;
}) {
  const t = useTranslations("common.documentCompare");
  const review = useTranslations("common.documentReview");
  const help = useId();
  const root = useRef<HTMLDivElement>(null);
  const anchor = useRef<number | null>(null);
  const [editing, setEditing] = useState<{ index: number; original: string; revision: number } | null>(null);
  const current = editing && editable && revision === editing.revision ? page.words[editing.index] : null;
  function begin(index: number) {
    if (!editable || !page.words[index]) return;
    select([index, index]);
    setEditing({ index, original: page.words[index].text, revision });
  }
  function finish() {
    setEditing(null);
    root.current?.focus({ preventScroll: true });
  }
  function indexAt(target: EventTarget | null) {
    const word = target instanceof Element && target.closest("[data-word]");
    return word ? Number(word.getAttribute("data-word")) : null;
  }
  return <>
    <div ref={root} tabIndex={0} role="group" aria-label={t("ocr")} aria-describedby={help}
      className="relative w-full bg-white text-black focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      style={{ aspectRatio: `${page.width}/${page.height}` }}
      onKeyDown={e => {
        if (e.target !== root.current) return;
        const previous = selected?.[1] ?? 0;
        if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); begin(previous); return; }
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const last = page.words.length - 1;
        const next = e.key === "Home" ? 0 : e.key === "End" ? last : Math.max(0, Math.min(last, previous + (e.key === "ArrowRight" ? 1 : -1)));
        select([e.shiftKey ? selected?.[0] ?? next : next, next]);
      }}>
      <svg viewBox={`0 0 ${page.width} ${page.height}`} className="block size-full cursor-text"
        onPointerDown={e => {
          if (!e.isPrimary || e.button !== 0) return;
          const index = indexAt(e.target);
          anchor.current = index;
          select(index === null ? null : [index, index]);
        }} onPointerMove={e => {
          if (anchor.current === null || e.buttons !== 1) return;
          const index = indexAt(document.elementFromPoint(e.clientX, e.clientY));
          if (index !== null) select([anchor.current, index]);
        }} onPointerUp={() => { anchor.current = null; }} onPointerCancel={() => { anchor.current = null; }}
        onDoubleClick={e => { const index = indexAt(e.target); if (index !== null) begin(index); }}>
        {page.words.map(({ text, box: [x, y, r, b] }, i) => (
          <g key={i} data-word={i} data-selected={isSelected(i, selected) || undefined}>
            <rect x={x} y={y} width={r-x} height={b-y} fill={isSelected(i, selected) ? "#fde68a" : "transparent"} />
            <text x={x} y={y + (b-y)*0.83} fontSize={b-y} textLength={r-x} lengthAdjust="spacingAndGlyphs" fill="currentColor">{text}</text>
          </g>
        ))}
      </svg>
      {current && editing && <input key={editing.index} aria-label={review("text")} maxLength={500}
        ref={node => { if (node && node !== document.activeElement) { node.focus(); node.select(); } }}
        value={current.text} onChange={e => updateText(editing.index, e.target.value)}
        className="absolute z-10 min-h-7 rounded border border-primary bg-background px-1 text-base text-foreground shadow-sm"
        style={{ top: `clamp(0px, ${100*current.box[1]/page.height}%, max(0px, 100% - 1.75rem))`,
          left: `min(${100*current.box[0]/page.width}%, max(0px, 100% - 7rem))`,
          width: `min(100%, max(7rem, ${100*(current.box[2]-current.box[0])/page.width}%))`, maxWidth: `calc(100% - min(${100*current.box[0]/page.width}%, max(0px, 100% - 7rem)))` }}
        onBlur={() => setEditing(null)} onKeyDown={e => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape") { e.preventDefault(); updateText(editing.index, editing.original); finish(); }
          if (e.key === "Enter") { e.preventDefault(); finish(); }
        }} />}
    </div>
    <p id={help} className="border-t border-border px-2 py-1 text-xs text-muted-foreground">{t(editable ? "inlineEdit" : "keyboardSelection")}</p>
    {editable && selected && !current && <button type="button" className="px-2 pb-1 text-sm text-primary underline"
      onClick={() => begin(selected[1])}>{t("editWord")}</button>}
  </>;
}
