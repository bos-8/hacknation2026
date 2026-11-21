"use server";

import { z } from "zod";
import { withAdminSession } from "@/server/auth/admin-action";
import { activateLlmPrompt, createLlmPrompt, readLlmSettings } from "@/server/llm-settings";

const promptSchema = z.string().trim().min(1).max(16000).refine(value => !value.includes("\0"));
const activationSchema = z.object({ uuid: z.uuid(), expectedActiveUuid: z.uuid() });

export async function loadPrompt(before?: number) {
  return withAdminSession(async () => {
    if (before !== undefined && !z.number().int().min(1).max(2147483647).safeParse(before).success)
      return { status: "invalid" as const };
    try {
      const settings = await readLlmSettings(before);
      return settings ? { status: "ok" as const, settings } : { status: "failed" as const };
    } catch { return { status: "failed" as const }; }
  });
}

export async function savePrompt(input: string) {
  return withAdminSession(async actorUuid => {
    const parsed = promptSchema.safeParse(input);
    if (!parsed.success) return { status: "invalid" as const };
    try {
      const prompt = await createLlmPrompt(actorUuid, parsed.data);
      return { status: "ok" as const, prompt };
    } catch { return { status: "failed" as const }; }
  });
}

export async function activatePrompt(input: { uuid: string; expectedActiveUuid: string }) {
  return withAdminSession(async actorUuid => {
    const parsed = activationSchema.safeParse(input);
    if (!parsed.success) return { status: "invalid" as const };
    try { return await activateLlmPrompt(actorUuid, parsed.data.uuid, parsed.data.expectedActiveUuid); }
    catch { return { status: "failed" as const }; }
  });
}
