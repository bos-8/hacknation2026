import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { ChatGeneration } from "@/schemas/chat";

const secondsFormat = { style: "unit", unit: "second", maximumFractionDigits: 2 } as const;

export function ChatGenerationTimer() {
  const format = useFormatter();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((performance.now() - started) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, []);
  return <span aria-hidden="true">· {format.number(seconds, secondsFormat)}</span>;
}

export function ChatGenerationDetails({ generation }: { generation: ChatGeneration }) {
  const t = useTranslations("chat.generation");
  const format = useFormatter();
  const seconds = (ms: number) => format.number(ms / 1000, secondsFormat);
  const count = (value?: number | null) => value == null ? t("unavailable") : format.number(value);
  const rows = [
    [t("model"), generation.model],
    [t("requestedModel"), generation.requestedModel],
    [t("promptVersion"), format.number(generation.promptVersion)],
    [t("effort"), t(generation.effort)],
    [t("summaryMode"), t(generation.summaryMode ?? "none")],
    [t("firstText"), seconds(generation.firstTextMs)],
    [t("totalTime"), seconds(generation.totalMs)],
    [t("inputTokens"), count(generation.usage?.input)],
    [t("cachedTokens"), count(generation.usage?.cached)],
    [t("cacheWriteTokens"), count(generation.usage?.cacheWrite)],
    [t("outputTokens"), count(generation.usage?.output)],
    [t("reasoningTokens"), count(generation.usage?.reasoning)],
    [t("totalTokens"), count(generation.usage?.total)],
    [t("outputLimit"), format.number(generation.outputLimit)],
    [t("serviceTier"), generation.serviceTier ?? t("unavailable")],
    [t("responseId"), generation.responseId ?? t("unavailable")],
  ];
  return <details data-chat-generation className="min-w-0 border-t border-border pt-2 text-xs text-muted-foreground">
    <summary className="cursor-pointer wrap-anywhere">
      <span className="font-medium">{t("details")}</span> · {generation.model} · {seconds(generation.totalMs)}
    </summary>
    <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
      {rows.map(([label, value]) => <div key={label} className="flex min-w-0 flex-wrap gap-x-1.5">
        <dt>{label}</dt>
        <dd className="wrap-anywhere font-medium text-foreground">{value}</dd>
      </div>)}
    </dl>
    <p className="mt-2">{t("timingHint")}</p>
  </details>;
}
