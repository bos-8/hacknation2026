import { z } from "zod";
import { LOGGED_ACCESS } from "@/schemas/access";
import {
  chatAttachmentCount, chatAttachmentLimit, chatAttachmentMime, chatMessageLimit, chatModeSchema,
  type ChatSendError, type ChatStreamEvent,
} from "@/schemas/chat";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { appendChatMessage, readChatContext, readChatReply, saveChatReply } from "@/server/chat";
import { jsonNoStore } from "@/server/http";
import { readActiveLlmPrompt } from "@/server/llm-settings";
import { ChatProviderError, getChatModel, streamOpenAiChat } from "@/server/openai-chat";

const maxBodyBytes = chatAttachmentCount * chatAttachmentLimit + 64 * 1024;
const activeOwners = new Set<string>();
const draftSchema = z.object({
  uuid: z.uuid().optional(), requestUuid: z.uuidv4(), mode: chatModeSchema,
  content: z.string().trim().max(chatMessageLimit),
});

function problem(status: ChatSendError, code: number) {
  return jsonNoStore({ status }, code);
}

async function readDraft(request: Request) {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) return { status: "invalid" } as const;
  const reader = request.body?.getReader();
  if (!reader) return { status: "invalid" } as const;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 30_000);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBodyBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: "tooLarge" } as const;
      }
      chunks.push(value);
    }
  } catch {
    return { status: "invalid" } as const;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  if (timedOut) return { status: "timeout" } as const;
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(Buffer.concat(chunks, length)), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    return { status: "invalid" } as const;
  }
  const parsed = draftSchema.safeParse({
    uuid: form.get("uuid") ?? undefined, requestUuid: form.get("requestUuid"),
    mode: form.get("mode"), content: form.get("content"),
  });
  const files = form.getAll("attachments");
  if (!parsed.success || files.length > chatAttachmentCount || (!parsed.data.content && !files.length))
    return { status: "invalid" } as const;
  const attachments = [];
  for (const file of files) {
    if (!(file instanceof File) || !file.size) return { status: "invalid" } as const;
    if (file.size > chatAttachmentLimit) return { status: "tooLarge" } as const;
    const name = file.name.normalize("NFC").trim();
    if (!name || name.length > 255 || name === "." || name === ".." || /[\\/\p{Cc}]/u.test(name))
      return { status: "invalid" } as const;
    if (!chatAttachmentMime(name)) return { status: "unsupportedFile" } as const;
    attachments.push({ name, size: file.size, content: new Uint8Array(await file.arrayBuffer()) });
  }
  return { status: "ok", draft: { ...parsed.data, attachments } } as const;
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) return problem("denied", 403);
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status === "unavailable") return problem("failed", 503);
  if (access.status !== "allowed" || !access.context.actorUuid) return problem("denied", 401);
  if (Number(request.headers.get("content-length")) > maxBodyBytes) return problem("tooLarge", 413);

  const owner = access.context.actorUuid;
  if (activeOwners.has(owner)) return problem("busy", 429);
  activeOwners.add(owner);
  const release = () => activeOwners.delete(owner);
  try {
    const parsed = await readDraft(request);
    if (parsed.status !== "ok") {
      release();
      return problem(parsed.status, parsed.status === "tooLarge" ? 413 : parsed.status === "timeout" ? 408 : 400);
    }
    const result = await appendChatMessage(owner, parsed.draft);
    if (result.status !== "ok") {
      release();
      return problem(result.status, result.status === "missing" ? 404 : 409);
    }
    const { conversation, entry } = result;
    const controller = new AbortController();
    const deadline = AbortSignal.timeout(110_000);
    const signal = AbortSignal.any([request.signal, controller.signal, deadline]);
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(stream) {
        const emit = (event: ChatStreamEvent) => {
          if (!controller.signal.aborted && !request.signal.aborted)
            stream.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        emit({ type: "saved", conversation, entry });
        const heartbeat = setInterval(() => emit({ type: "ping" }), 15_000);
        try {
          let reply = await readChatReply(conversation.uuid, entry.uuid);
          if (!reply) {
            const model = getChatModel(entry.mode);
            if (!model) throw new ChatProviderError("notConfigured");
            const [prompt, context] = await Promise.all([
              readActiveLlmPrompt(), readChatContext(conversation.uuid, entry.uuid),
            ]);
            if (!prompt) throw new ChatProviderError("notConfigured");
            const { content, generation } = await streamOpenAiChat({
              ...model, mode: entry.mode, instructions: prompt.systemPrompt, promptVersion: prompt.version, context, signal,
              onDelta: (type, delta) => emit({ type, delta }),
            });
            reply = await saveChatReply(conversation.uuid, entry.uuid, entry.mode, content, generation);
          }
          emit({ type: "done", entry: reply });
        } catch (error) {
          const status = deadline.aborted ? "timeout" : error instanceof ChatProviderError ? error.status :
            error instanceof TypeError ? "providerUnavailable" : "failed";
          emit({ type: "error", status });
        } finally {
          clearInterval(heartbeat);
          release();
          if (!controller.signal.aborted) stream.close();
        }
      },
      cancel() { controller.abort(); },
    });
    return new Response(body, { headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    release();
    return problem("failed", 503);
  }
}
