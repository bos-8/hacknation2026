import "server-only";
import { z } from "zod";
import { streamLines } from "../lib/stream-lines.ts";
import { chatAttachmentMime, type ChatGeneration, type ChatMode, type ChatSendError } from "../schemas/chat.ts";
import type { readChatContext } from "./chat.ts";

export class ChatProviderError extends Error {
  readonly status: ChatSendError;

  constructor(status: ChatSendError) {
    super(status);
    this.status = status;
  }
}

export function getChatModel(mode: ChatMode) {
  const key = process.env.OPENAI_API_KEY?.trim();
  const model = (mode === "thinking" ? process.env.OPENAI_MODEL_THINKING : process.env.OPENAI_MODEL_INSTANT)?.trim();
  return key && model ? { key, model } : null;
}

type Context = Awaited<ReturnType<typeof readChatContext>>;
type InputPart = { type: "input_text"; text: string } |
  { type: "input_image"; image_url: string; detail: "auto" } |
  { type: "input_file"; filename: string; file_data: string };

const providerCount = z.number().int().nonnegative().nullish();
const providerResultSchema = z.object({
  id: z.string().nullish(),
  model: z.string().nullish(),
  service_tier: z.string().nullish(),
  usage: z.object({
    input_tokens: providerCount,
    output_tokens: providerCount,
    total_tokens: providerCount,
    input_tokens_details: z.object({ cached_tokens: providerCount, cache_write_tokens: providerCount }).nullish(),
    output_tokens_details: z.object({ reasoning_tokens: providerCount }).nullish(),
  }).nullish(),
});

export async function streamOpenAiChat({
  key, model, mode, instructions, promptVersion, context, signal, onDelta,
}: {
  key: string; model: string; mode: ChatMode; instructions: string; promptVersion: number;
  context: Context; signal: AbortSignal;
  onDelta: (type: "text" | "summary", delta: string) => void;
}) {
  const input = context.flatMap<{ role: "user" | "assistant"; content: string | InputPart[] }>(({ role, content, attachments }) => {
    if (role === "assistant") return [{ role, content }];
    const parts: InputPart[] = content ? [{ type: "input_text", text: content }] : [];
    for (const { name, content: bytes } of attachments) {
      const mime = chatAttachmentMime(name);
      if (!mime) continue;
      const data = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
      parts.push(mime.startsWith("image/") ? { type: "input_image", image_url: data, detail: "auto" } :
        { type: "input_file", filename: name, file_data: data });
    }
    return parts.length ? [{ role, content: parts }] : [];
  });
  if (!input.length) throw new ChatProviderError("unsupportedFile");
  const outputLimit = 8192;
  const effort = mode === "thinking" ? "medium" : "none";
  const summaryMode = mode === "thinking" ? "auto" : null;
  const body = JSON.stringify({
    model, instructions, input, stream: true, store: false, max_output_tokens: outputLimit,
    reasoning: { effort, ...(summaryMode && { summary: summaryMode }) },
  });
  const started = performance.now();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body, cache: "no-store", signal,
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 429) throw new ChatProviderError("providerLimit");
    if (response.status >= 400 && response.status < 500) throw new ChatProviderError("providerRejected");
    throw new ChatProviderError("providerUnavailable");
  }
  let firstTextMs: number | undefined;
  const { content, result } = await readOpenAiReply(response.body, (type, delta) => {
    if (type === "text") firstTextMs ??= Math.round(performance.now() - started);
    onDelta(type, delta);
  }).catch(error => {
    if (error instanceof ChatProviderError || signal.aborted) throw error;
    throw new ChatProviderError("providerUnavailable");
  });
  const totalMs = Math.round(performance.now() - started);
  const usage = result?.usage;
  const generation: ChatGeneration = {
    model: result?.model ?? model, requestedModel: model, effort, summaryMode, promptVersion, outputLimit,
    firstTextMs: firstTextMs ?? totalMs, totalMs, serviceTier: result?.service_tier ?? null,
    responseId: result?.id ?? null,
    usage: usage ? {
      input: usage.input_tokens ?? null, output: usage.output_tokens ?? null, total: usage.total_tokens ?? null,
      cached: usage.input_tokens_details?.cached_tokens ?? null,
      cacheWrite: usage.input_tokens_details?.cache_write_tokens ?? null,
      reasoning: usage.output_tokens_details?.reasoning_tokens ?? null,
    } : null,
  };
  return { content, generation };
}

export async function readOpenAiReply(
  body: ReadableStream<Uint8Array>, onDelta: (type: "text" | "summary", delta: string) => void,
) {
  let answer = "";
  let data: string[] = [];
  for await (const line of streamLines(body)) {
    if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    if (line !== "" || !data.length) continue;
    const payload = data.join("\n");
    data = [];
    if (payload === "[DONE]") break;
    const event = JSON.parse(payload) as { type: string; delta?: string; response?: unknown };
    if (event.type === "response.completed" && answer.trim()) {
      return { content: answer, result: providerResultSchema.safeParse(event.response).data };
    }
    if (event.type === "response.failed" || event.type === "error") throw new ChatProviderError("providerUnavailable");
    if (event.type === "response.incomplete") break;
    if (!event.delta) continue;
    if (event.type === "response.reasoning_summary_text.delta") onDelta("summary", event.delta);
    if (event.type === "response.output_text.delta" || event.type === "response.refusal.delta") {
      answer += event.delta;
      onDelta("text", event.delta);
    }
  }
  throw new ChatProviderError("incomplete");
}
