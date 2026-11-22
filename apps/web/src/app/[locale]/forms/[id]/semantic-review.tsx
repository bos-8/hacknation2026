"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ExtendedProfile } from "@/schemas/form-upload";
import { Button } from "@/ui/basic";

export function SemanticReview({id, revision, profile}: {id: string; revision: number; profile: ExtendedProfile}) {
  const t = useTranslations("forms.semanticReview");
  const router = useRouter();
  const pending = profile.candidates.filter(c => c.decision === "REVIEW" && !c.resolution);
  const [selected, select] = useState("");
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<"saved" | "conflict" | "error">();
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState("REJECT");
  const item = pending.find(c => c.key === selected) ?? pending[0];

  async function resolve(outcome: "ACCEPT" | "DECLINE") {
    if (!item || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/forms/${id}/review`, {method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({key: item.key, outcome, reason, revision})});
      setFeedback(r.ok ? "saved" : r.status === 409 ? "conflict" : "error");
      if (r.ok) setReason("");
      if (r.ok || r.status === 409) router.refresh();
    } catch { setFeedback("error"); }
    finally { setBusy(false); }
  }

  return <details className="rounded-md border border-panel-border p-3">
    <summary className="cursor-pointer font-medium">{t("heading", {count: pending.length})}</summary>
    <p className="my-2">{profile.profileId} · {profile.version} · {profile.asOf}</p>
    {item && <div className="space-y-2">
      <label className="block">{t("candidate")}
        <select value={item.key} disabled={busy} className="block w-full rounded border border-panel-border bg-panel p-2"
          onChange={e => {select(e.target.value); setReason(""); setFeedback(undefined);}}>
          {pending.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>
      <p>{item.reviewReason}</p>
      {profile.legalRules.filter(r => item.legalRuleIds.includes(r.id)).map(r => <p key={r.id}>{r.id} · {r.basis}</p>)}
      <p>{item.sourceEvidence.join(", ")}</p>
      <p>{t(item.canIncludeAfterReview ? "includeEffect" : "profileEffect")}</p>
      <label className="block">{t("reason")}
        <textarea value={reason} maxLength={500} disabled={busy} onChange={e => setReason(e.target.value)}
          className="block w-full rounded border border-panel-border bg-panel p-2"/>
      </label>
      <div className="flex gap-2">{(["ACCEPT","DECLINE"] as const).map(action =>
        <Button key={action} type="button" size="sm" tone="main-outline" disabled={busy || reason.trim().length < 3}
          onClick={() => void resolve(action)}>{t(action)}</Button>)}</div>
    </div>}
    <ul className="mt-2">{profile.candidates.filter(c => c.resolution).map(c =>
      <li key={c.key}>{c.label} · {t(c.resolution!.outcome)} · {c.resolution!.reason}</li>)}</ul>
    <p role="status">{feedback && t(feedback)}</p>
    <details className="mt-3 border-t border-panel-border pt-2">
      <summary className="cursor-pointer">{t("audit")}</summary>
      <label className="my-2 block">{t("filter")} <select value={decision} onChange={e => setDecision(e.target.value)}
        className="rounded border border-panel-border bg-panel px-2 py-1">
        {["AUTO", "CONDITIONAL", "REVIEW", "REJECT"].map(d => <option key={d}>{d}</option>)}
      </select></label>
      <ul className="divide-y divide-panel-border">{profile.candidates.filter(c => c.decision === decision).map(c =>
        <li key={c.key} className="py-2"><strong>{c.label}</strong>
          <p>{c.reviewReason || c.purpose?.toString()}</p>
          <small>{[...c.legalRuleIds, ...c.sourceEvidence].join(" · ")}</small>
        </li>)}</ul>
      <ul className="mt-3">{profile.sources.filter(s => s.url?.startsWith("https://")).map(s =>
        <li key={s.sourceId}><a className="text-accent underline" href={s.url} target="_blank" rel="noreferrer">{s.sourceId}</a></li>)}</ul>
    </details>
  </details>;
}
