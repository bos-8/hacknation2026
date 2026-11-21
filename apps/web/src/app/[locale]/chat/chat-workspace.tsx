"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowUp, ChatDots, ChatSquareText, ClockHistory, Download, ExclamationCircle, LightningCharge, Paperclip, Pencil, Person, PlusLg, Robot, Stars, X } from "react-bootstrap-icons";
import { API_ROUTES } from "@/config/api-routes";
import { streamLines } from "@/lib/stream-lines";
import {
  chatAttachmentCount, chatAttachmentLimit, chatAttachmentMime, chatAttachmentMimeTypes, chatMessageLimit,
  type ChatMessage, type ChatMode, type ChatStreamEvent, type ChatSummary,
} from "@/schemas/chat";
import { Button, Throbber } from "@/ui/basic";
import { PushAside } from "@/ui/components/aside";
import { loadChatHistory, openChat, saveChatTitle } from "./actions";
import { ChatGenerationDetails, ChatGenerationTimer } from "./chat-generation";
import { ChatMarkdown } from "./chat-markdown";

type History = { rows: ChatSummary[]; more: boolean };

export function ChatWorkspace({ initial }: { initial: History | null }) {
  const t = useTranslations("chat");
  const format = useFormatter();
  const [history, setHistory] = useState(initial);
  const [storageAvailable, setStorageAvailable] = useState(initial !== null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [active, setActive] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<ChatMode>("instant");
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<{ text: string; summary: string; finished: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const [transitioning, startTransition] = useTransition();
  const pending = transitioning || sending;
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const requestUuid = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages, reply]);

  const bytes = (size: number) => format.number(size, { style: "unit", unit: "byte", notation: "compact" });
  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try { await action(); } catch { setStorageAvailable(false); setError("failed"); }
    });
  }

  function recordStorageStatus(status: string) {
    if (status === "ok" || status === "failed") setStorageAvailable(status === "ok");
  }

  function clearDraft() {
    setDraft("");
    setFiles([]);
    requestUuid.current = null;
  }

  function refreshHistory(append = false) {
    run(async () => {
      const next = await loadChatHistory(append ? history?.rows.length ?? 0 : 0);
      recordStorageStatus(next.status);
      if (next.status !== "ok") { setError(next.status); return; }
      setHistory(previous => ({
        rows: append && previous ? [...new Map([...previous.rows, ...next.rows].map(row => [row.uuid, row])).values()] : next.rows,
        more: next.more,
      }));
    });
  }

  function selectChat(uuid: string) {
    run(async () => {
      const result = await openChat(uuid);
      recordStorageStatus(result.status);
      if (result.status !== "ok") { setError(result.status); return; }
      const { messages, ...chat } = result.chat;
      setActive(chat);
      setMessages(messages);
      setReply(null);
      setMode(chat.mode);
      setHistoryOpen(false);
      setTitle(null);
      clearDraft();
    });
  }

  function newChat() {
    setActive(null);
    setMessages([]);
    setReply(null);
    setMode("instant");
    setTitle(null);
    setError(null);
    setHistoryOpen(false);
    clearDraft();
    if (!historyOpen) composer.current?.focus();
  }

  function addFiles(selection: FileList | null) {
    if (!selection?.length || pending) return;
    const incoming = [...selection];
    if (files.length + incoming.length > chatAttachmentCount) { setError("attachmentCount"); return; }
    if (incoming.some(file => file.size > chatAttachmentLimit)) { setError("tooLarge"); return; }
    if (incoming.some(file => file.size === 0)) { setError("invalid"); return; }
    if (incoming.some(file => !chatAttachmentMime(file.name))) { setError("unsupportedFile"); return; }
    setError(null);
    requestUuid.current = null;
    setFiles([...files, ...incoming]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || request.current || (!draft.trim() && files.length === 0)) return;
    const form = new FormData();
    form.set("requestUuid", requestUuid.current ??= crypto.randomUUID());
    form.set("mode", mode);
    form.set("content", draft);
    if (active) form.set("uuid", active.uuid);
    for (const file of files) form.append("attachments", file);
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setSending(true);
    setReply({ text: "", summary: "", finished: false });
    try {
      const response = await fetch(API_ROUTES.chat, { method: "POST", body: form, signal: controller.signal });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        const status = typeof failure?.status === "string" ? failure.status : response.status === 413 ? "tooLarge" : "failed";
        recordStorageStatus(status);
        setError(status);
        return;
      }
      if (!response.body) throw new Error("Missing chat stream");
      let complete = false;
      for await (const line of streamLines(response.body)) {
        if (!line) continue;
        const update = JSON.parse(line) as ChatStreamEvent;
        if (update.type === "saved") {
          const { conversation, entry } = update;
          const chat = { ...conversation, updatedAt: new Date(conversation.updatedAt) };
          setStorageAvailable(true);
          setActive(chat);
          setMessages(previous => previous.some(row => row.uuid === entry.uuid) ? previous :
            [...previous, { ...entry, createdAt: new Date(entry.createdAt) }]);
          setHistory(previous => ({
            rows: [chat, ...(previous?.rows.filter(row => row.uuid !== chat.uuid) ?? [])],
            more: previous?.more ?? true,
          }));
        } else if (update.type === "text" || update.type === "summary") {
          const field = update.type;
          setReply(previous => previous && { ...previous, [field]: previous[field] + update.delta });
        } else if (update.type === "done") {
          const entry = { ...update.entry, createdAt: new Date(update.entry.createdAt) };
          setMessages(previous => previous.some(row => row.uuid === entry.uuid) ? previous : [...previous, entry]);
          setReply(previous => previous?.summary ? { ...previous, text: "", finished: true } : null);
          clearDraft();
          complete = true;
        } else if (update.type === "error") {
          setError(update.status);
          complete = true;
        }
      }
      if (!complete) setError("incomplete");
    } catch {
      if (!controller.signal.aborted) setError("failed");
    } finally {
      if (!controller.signal.aborted) {
        setReply(previous => previous?.finished ? previous : null);
        setSending(false);
      }
      request.current = null;
    }
  }

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || !title?.trim() || pending) return;
    run(async () => {
      const result = await saveChatTitle(active.uuid, title);
      recordStorageStatus(result.status);
      if (result.status !== "ok") { setError(result.status); return; }
      setActive(result.chat);
      setHistory(previous => ({ rows: [result.chat, ...(previous?.rows.filter(row => row.uuid !== result.chat.uuid) ?? [])],
        more: previous?.more ?? false }));
      setTitle(null);
    });
  }

  const historyContent = <>
    {error && historyOpen && <p className="text-sm text-error" role="alert">{t(`errors.${error}`)}</p>}
    {history === null ? <Button size="sm" disabled={pending} onClick={() => refreshHistory()}>{t("retry")}</Button> :
      history.rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("emptyHistory")}</p> :
        <ul className="space-y-1">
          {history.rows.map(chat => <li key={chat.uuid}><button type="button" aria-current={active?.uuid === chat.uuid ? "true" : undefined}
            disabled={pending} className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted aria-[current=true]:bg-primary/10"
            onClick={() => selectChat(chat.uuid)}>
            <ChatSquareText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="grid min-w-0 gap-1">
              <span className="truncate text-sm font-medium" title={chat.title}>{chat.title}</span>
              <span className="text-xs text-muted-foreground">{format.dateTime(chat.updatedAt, { dateStyle: "medium", timeStyle: "short" })}</span>
            </span>
          </button></li>)}
        </ul>}
    {history?.more && <Button className="mt-3" size="sm" disabled={pending} onClick={() => refreshHistory(true)}>{t("loadMore")}</Button>}
  </>;

  return <section data-chat-workspace className="glass-shell glass-panel mx-auto my-3 flex min-h-0 flex-1 overflow-hidden">
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border px-3 py-2 sm:px-6">
        <span className="glass-icon grid size-9 shrink-0 place-items-center rounded-xl"><ChatDots aria-hidden="true" className="size-5" /></span>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold" title={active?.title}>{active?.title ?? t("title")}</h1>
      <span role="status" className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
        title={t(storageAvailable ? "backendReady" : "backendUnavailable")}>
        <span aria-hidden="true" className={`size-2 rounded-full ${storageAvailable ? "bg-success" : "bg-warning"}`} />
        <span className="sr-only lg:not-sr-only">{t(storageAvailable ? "backendReady" : "backendUnavailable")}</span>
      </span>
        {active && <Button size="sm" tone="main-outline" aria-label={t("rename")} tooltip={t("rename")} disabled={pending}
          onClick={() => setTitle(active.title)}><Pencil className="size-4" aria-hidden="true" /></Button>}
        <Button size="sm" tone="main-outline" disabled={pending} onClick={newChat}>
          <PlusLg className="size-4" aria-hidden="true" /><span className="sr-only sm:not-sr-only">{t("newChat")}</span>
        </Button>
        <Button ref={historyTrigger} size="sm" tone={historyOpen ? "primary" : "main-outline"} aria-expanded={historyOpen}
          disabled={pending} onClick={() => setHistoryOpen(!historyOpen)}>
          <ClockHistory className="size-4" aria-hidden="true" /><span className="sr-only sm:not-sr-only">{t("history")}</span>
        </Button>
      </header>
      {title !== null && <form onSubmit={rename} className="flex shrink-0 flex-wrap items-end gap-2 border-b border-border px-3 py-3 sm:px-6">
        <label className="grid min-w-40 flex-1 gap-1 text-sm">{t("rename")}
          <input className="min-w-0 rounded-md border border-input-border bg-input px-3 py-2" value={title} maxLength={120}
            onChange={event => setTitle(event.target.value)} disabled={pending} />
        </label>
        <Button size="sm" disabled={pending} onClick={() => setTitle(null)}>{t("cancel")}</Button>
        <Button type="submit" size="sm" tone="primary" disabled={pending || !title.trim()}>{t("save")}</Button>
      </form>}

      <div ref={transcript} role="region" tabIndex={0} aria-label={t("messages")} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6">
          {messages.length === 0 && !reply && <div className="m-auto grid max-w-sm justify-items-center gap-2 px-3 py-3 text-center sm:gap-3 sm:py-8">
            <span className="glass-icon rounded-2xl p-3"><ChatDots className="size-7" aria-hidden="true" /></span>
            <p className="text-xl font-semibold">{t("emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
          </div>}
          {messages.map((message, index) => <article key={message.uuid} className={`w-fit max-w-[95%] space-y-2 px-4 py-3 sm:max-w-[80%] ${message.role === "user" ? "self-end rounded-xl border border-primary/20 bg-primary/10" : "glass-inset"}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {message.role === "user" ? <Person aria-hidden="true" className="size-4" /> : <Robot aria-hidden="true" className="size-4" />}
              <span className="font-semibold">{t(message.role)}</span>
              <span className="inline-flex items-center gap-1">
                {message.mode === "instant" ? <LightningCharge aria-hidden="true" className="size-3" /> : <Stars aria-hidden="true" className="size-3" />}
                {t(message.mode)}
              </span>
              <time dateTime={message.createdAt.toISOString()} className="ms-auto shrink-0 tabular-nums"
                title={format.dateTime(message.createdAt, { dateStyle: "medium", timeStyle: "medium" })}>
                {format.dateTime(message.createdAt, { timeStyle: "medium" })}
              </time>
            </div>
            {reply?.finished && index === messages.length - 1 && message.role === "assistant" && <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">{t("reasoningSummary")}</summary>
              <div className="mt-2"><ChatMarkdown content={reply.summary} /></div>
            </details>}
            {message.content && (message.role === "assistant"
              ? <div className="text-sm"><ChatMarkdown content={message.content} /></div>
              : <p className="wrap-anywhere whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>)}
            {message.attachments.map(file => <a key={file.uuid} download href={API_ROUTES.chatAttachment.replace("{uuid}", file.uuid)}
              className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm hover:text-primary">
              <Download className="size-4 shrink-0" aria-hidden="true" />
              <span className="wrap-anywhere">{file.name}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{bytes(file.size)}</span>
            </a>)}
            {message.generation && <ChatGenerationDetails generation={message.generation} />}
          </article>)}
          {reply && !reply.finished && <article className="glass-inset w-fit max-w-[95%] space-y-2 px-4 py-3 sm:max-w-[80%]">
            <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <Robot aria-hidden="true" className="size-4" />
              <span className="font-semibold">{t("assistant")}</span>
              <span>{t(reply.text || mode === "instant" ? "responding" : "thinking")}</span>
              <ChatGenerationTimer />
            </div>
            {reply.summary && <details open className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">{t("reasoningSummary")}</summary>
              <div className="mt-2"><ChatMarkdown content={reply.summary} /></div>
            </details>}
            {reply.text && <div className="text-sm"><ChatMarkdown content={reply.text} /></div>}
          </article>}
        </div>
      </div>

      <div data-chat-composer className="shrink-0 border-t border-border px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-6">
        <form onSubmit={submit} aria-busy={sending} className="glass-inset mx-auto max-h-[55dvh] max-w-4xl overflow-y-auto p-2 sm:p-3"
          onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
          onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); addFiles(event.dataTransfer.files); } }}>
          {files.length > 0 && <div className="flex flex-wrap gap-2 px-1 pb-2">
            {files.map((file, index) => <div key={index} className="flex max-w-full items-center gap-2 rounded-md border border-border px-2 text-xs">
              <Paperclip aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate" title={file.name}>{file.name}</span>
              <Button size="icon" tone="ghost" className="size-7 p-0" disabled={pending} aria-label={t("removeFile", { name: file.name })}
                onClick={() => { requestUuid.current = null; setFiles(files.filter((_, position) => position !== index)); }}>
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>)}
          </div>}
          <textarea ref={composer} rows={2} maxLength={chatMessageLimit} value={draft} disabled={pending} aria-label={t("message")}
            placeholder={t("placeholder")} className="max-h-[22dvh] w-full resize-y rounded-md bg-transparent p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={event => { requestUuid.current = null; setDraft(event.target.value); }}
            onKeyDown={event => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }} />
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInput} type="file" multiple hidden accept={Object.keys(chatAttachmentMimeTypes).join(",")}
              onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
            <Button size="sm" tone="main-outline" disabled={pending || files.length >= chatAttachmentCount}
              tooltip={t("attachmentHint")} onClick={() => fileInput.current?.click()}>
              <Paperclip className="size-4" aria-hidden="true" />{t("attach")}
            </Button>
            <div role="group" aria-label={t("mode")} className="flex flex-wrap gap-1">
              {(["instant", "thinking"] as const).map(value => {
                const Icon = value === "instant" ? LightningCharge : Stars;
                return <Button key={value} size="sm" tone={mode === value ? "primary" : "main-outline"} aria-pressed={mode === value}
                  disabled={pending} onClick={() => { requestUuid.current = null; setMode(value); }}>
                  <Icon className="size-4" aria-hidden="true" />{t(value)}
                </Button>;
              })}
            </div>
            <Button type="submit" size="sm" tone="primary" className="ml-auto" disabled={pending || (!draft.trim() && files.length === 0)}>
              {sending ? <Throbber size="sm" label={t("responding")} /> : <><ArrowUp className="size-4" aria-hidden="true" />{t("send")}</>}
            </Button>
          </div>
          {error && !historyOpen && <p className="mt-2 text-sm text-error" role="alert">{t(`errors.${error}`)}</p>}
        </form>
        <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-x-3 gap-y-1 pt-2 text-center text-xs text-muted-foreground">
          <span>{t("providerNotice")}</span>
          <span className="inline-flex items-center justify-center gap-1"><ExclamationCircle aria-hidden="true" className="size-3.5 shrink-0" />{t("aiCaution")}</span>
        </div>
      </div>
    </div>
    <PushAside data-chat-history className="glass-panel" open={historyOpen} triggerRef={historyTrigger} onClose={() => setHistoryOpen(false)} title={t("history")} icon={<ClockHistory aria-hidden="true" className="size-5 text-primary" />}>
      {historyContent}
    </PushAside>
  </section>;
}
