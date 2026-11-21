"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowClockwise, CheckCircle, Eye, Floppy, Robot } from "react-bootstrap-icons";
import { Button, Throbber } from "@/ui/basic";
import { PushAside } from "@/ui/components/aside";
import { activatePrompt, loadPrompt, savePrompt } from "./actions";

type Prompt = { uuid: string; systemPrompt: string; version: number; createdAt: Date };
type Settings = { active: Prompt; versions: Prompt[]; more: boolean };
type Result = "saved" | "activated" | "denied" | "invalid" | "conflict" | "failed";

export function LlmSettingsForm({ initial, configured }: { initial: Settings | null; configured: boolean }) {
  const t = useTranslations("common.admin.llm");
  const format = useFormatter();
  const [settings, setSettings] = useState(initial);
  const [draft, setDraft] = useState(initial?.active.systemPrompt ?? "");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<{ prompt: Prompt; open: boolean } | null>(null);
  const previewTrigger = useRef<HTMLButtonElement>(null);

  function versionLabel(prompt: Prompt) {
    return t("revision", { revision: prompt.version, date: format.dateTime(prompt.createdAt, { dateStyle: "medium", timeStyle: "short" }) });
  }

  function run(action: () => Promise<void>) {
    setResult(null);
    startTransition(async () => {
      try { await action(); } catch { setResult("failed"); }
    });
  }

  function reload(append = false) {
    const before = append ? settings?.versions.at(-1)?.version : undefined;
    run(async () => {
      const response = await loadPrompt(before);
      if (response.status !== "ok") { setResult(response.status); return; }
      setSettings(current => ({
        ...response.settings,
        versions: append && current ? [...current.versions, ...response.settings.versions] : response.settings.versions,
      }));
      if (!settings) setDraft(response.settings.active.systemPrompt);
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || !draft.trim() || pending) return;
    run(async () => {
      const response = await savePrompt(draft);
      if (response.status !== "ok") { setResult(response.status); return; }
      setSettings(current => current && { ...current, versions: [response.prompt, ...current.versions] });
      setDraft(response.prompt.systemPrompt);
      setResult("saved");
    });
  }

  function activate(uuid: string) {
    if (!settings || pending || uuid === settings.active.uuid) return;
    run(async () => {
      const response = await activatePrompt({ uuid, expectedActiveUuid: settings.active.uuid });
      if (response.status !== "ok") { setResult(response.status); return; }
      setSettings(current => current && { ...current, active: response.prompt });
      setResult("activated");
    });
  }

  const success = result === "saved" || result === "activated";
  const versions = settings && (settings.versions.some(prompt => prompt.uuid === settings.active.uuid)
    ? settings.versions : [settings.active, ...settings.versions]);

  return <>
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <Robot aria-hidden="true" className="size-4" />
      <span>{t(configured ? "configured" : "missingConfig")}</span>
    </div>
    <form onSubmit={submit} aria-busy={pending} className="space-y-3 rounded-lg border border-border bg-card p-4">
      <label className="grid gap-1.5 text-sm font-semibold">
        {t("prompt")}
        <textarea rows={10} maxLength={16000} value={draft} onChange={event => { setDraft(event.target.value); setResult(null); }}
          disabled={!settings || pending} aria-describedby="llm-prompt-hint"
          className="w-full resize-y rounded-md border border-input-border bg-input px-3 py-2 text-sm font-normal" />
      </label>
      <p id="llm-prompt-hint" className="text-sm text-muted-foreground">{t("promptHint")}</p>
      {!settings && !result && <p role="alert" className="text-sm text-error">{t("result.failed")}</p>}
      {result && <p role={success ? "status" : "alert"} className={success ? "text-sm text-success" : "text-sm text-error"}>
        {t(`result.${result}`)}
      </p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" tone="primary" disabled={!settings || !draft.trim() || pending}>
          {pending ? <Throbber size="sm" /> : <Floppy aria-hidden="true" className="size-4" />}{t("save")}
        </Button>
        <Button size="sm" tone="main-outline" disabled={pending} onClick={() => reload()}>
          <ArrowClockwise aria-hidden="true" className="size-4" />{t("reload")}
        </Button>
      </div>
    </form>
    {settings && versions && <section aria-label={t("versions")} className="space-y-2">
      <h3 className="font-semibold">{t("versions")}</h3>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {versions.map(prompt => <li key={prompt.uuid} className="flex flex-wrap items-center gap-2 p-3">
          <div className="min-w-40 flex-1 text-sm">
            <p className="font-medium">{versionLabel(prompt)}</p>
            {prompt.uuid === settings.active.uuid && <span className="inline-flex items-center gap-1 text-xs text-success">
              <CheckCircle aria-hidden="true" className="size-3.5" />{t("active")}
            </span>}
          </div>
          <Button size="sm" tone={preview?.open && preview.prompt.uuid === prompt.uuid ? "primary" : "main-outline"}
            disabled={pending} aria-expanded={preview?.open === true && preview.prompt.uuid === prompt.uuid}
            onClick={event => {
              previewTrigger.current = event.currentTarget;
              setPreview(current => ({ prompt, open: !(current?.open && current.prompt.uuid === prompt.uuid) }));
            }}>
            <Eye aria-hidden="true" className="size-4" />{t("preview")}
          </Button>
          <Button size="sm" tone="main-outline" disabled={pending} onClick={() => setDraft(prompt.systemPrompt)}>{t("useDraft")}</Button>
          <Button size="sm" tone="success-outline" disabled={pending || prompt.uuid === settings.active.uuid}
            onClick={() => activate(prompt.uuid)}>{t("activate")}</Button>
        </li>)}
      </ul>
      {settings.more && <Button size="sm" disabled={pending} onClick={() => reload(true)}>{t("older")}</Button>}
    </section>}
    {preview && <PushAside open={preview.open} triggerRef={previewTrigger}
      onClose={() => setPreview(current => current && { ...current, open: false })}
      title={t("previewTitle")} description={versionLabel(preview.prompt)}>
      <pre className="wrap-anywhere whitespace-pre-wrap rounded-md border border-border bg-card p-3 font-mono text-sm leading-relaxed">{preview.prompt.systemPrompt}</pre>
    </PushAside>}
  </>;
}
