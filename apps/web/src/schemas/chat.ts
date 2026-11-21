import { z } from "zod";

export const chatModeSchema = z.enum(["instant", "thinking"]);
export const chatTitleSchema = z.string().trim().min(1).max(120);
export const chatMessageLimit = 8000;
export const chatAttachmentLimit = 2 * 1024 * 1024;
export const chatAttachmentCount = 3;
export const chatHistoryPageSize = 30;
export const chatAttachmentMimeTypes: Readonly<Record<string, string>> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function chatAttachmentMime(name: string) {
  return chatAttachmentMimeTypes[/\.[^.]+$/.exec(name.toLowerCase())?.[0] ?? ""];
}

export type ChatMode = z.infer<typeof chatModeSchema>;
export type ChatSummary = { uuid: string; title: string; mode: ChatMode; updatedAt: Date };

const count = z.number().int().nonnegative();
export const chatGenerationSchema = z.object({
  model: z.string(),
  requestedModel: z.string(),
  effort: z.enum(["none", "medium"]),
  summaryMode: z.literal("auto").nullable(),
  promptVersion: count,
  outputLimit: count,
  firstTextMs: count,
  totalMs: count,
  serviceTier: z.string().nullable(),
  responseId: z.string().nullable(),
  usage: z.object({
    input: count.nullable(), output: count.nullable(), total: count.nullable(),
    cached: count.nullable(), cacheWrite: count.nullable(), reasoning: count.nullable(),
  }).nullable(),
});

export type ChatGeneration = z.infer<typeof chatGenerationSchema>;
export type ChatMessage = {
  uuid: string;
  role: "user" | "assistant";
  mode: ChatMode;
  content: string;
  createdAt: Date;
  attachments: { uuid: string; name: string; size: number }[];
  generation?: ChatGeneration | null;
};

export type ChatSendError = "invalid" | "denied" | "missing" | "failed" | "limit" | "tooLarge" |
  "unsupportedFile" | "notConfigured" | "providerUnavailable" | "providerRejected" | "providerLimit" |
  "incomplete" | "timeout" | "busy";

export type ChatStreamEvent =
  | { type: "saved"; conversation: ChatSummary; entry: ChatMessage }
  | { type: "text" | "summary"; delta: string }
  | { type: "done"; entry: ChatMessage }
  | { type: "error"; status: ChatSendError }
  | { type: "ping" };
