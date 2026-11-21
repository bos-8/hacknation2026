import "server-only";
import { getDatabase } from "./database.ts";

const settingsKey = "chat";
const pageSize = 20;
const promptFields = { uuid: true, systemPrompt: true, version: true, createdAt: true } as const;

export async function readActiveLlmPrompt() {
  const settings = await getDatabase().llmSettings.findUnique({
    where: { key: settingsKey }, select: { activePrompt: { select: { systemPrompt: true, version: true } } },
  });
  return settings?.activePrompt ?? null;
}

export async function readLlmSettings(before?: number) {
  const settings = await getDatabase().llmSettings.findUnique({ where: { key: settingsKey }, select: {
    activePrompt: { select: promptFields },
    versions: { where: before === undefined ? undefined : { version: { lt: before } },
      orderBy: { version: "desc" }, take: pageSize + 1, select: promptFields },
  } });
  if (!settings?.activePrompt) return null;
  return { active: settings.activePrompt, versions: settings.versions.slice(0, pageSize), more: settings.versions.length > pageSize };
}

export async function createLlmPrompt(actorUuid: string, systemPrompt: string) {
  return getDatabase().$transaction(async tx => {
    const [settings] = await tx.$queryRaw<{ uuid: string }[]>`
      SELECT uuid FROM llm_settings WHERE key = ${settingsKey} FOR UPDATE
    `;
    if (!settings) throw new Error("Missing LLM settings");
    const latest = await tx.llmPromptVersion.findFirst({
      where: { settingsUuid: settings.uuid }, orderBy: { version: "desc" }, select: { version: true },
    });
    return tx.llmPromptVersion.create({
      data: { settingsUuid: settings.uuid, version: (latest?.version ?? 0) + 1, systemPrompt, createdByUuid: actorUuid },
      select: promptFields,
    });
  });
}

export async function activateLlmPrompt(actorUuid: string, uuid: string, expectedActiveUuid: string) {
  return getDatabase().$transaction(async tx => {
    const [settings] = await tx.$queryRaw<{ uuid: string; active_prompt_uuid: string }[]>`
      SELECT uuid, active_prompt_uuid FROM llm_settings WHERE key = ${settingsKey} FOR UPDATE
    `;
    if (settings?.active_prompt_uuid !== expectedActiveUuid) return { status: "conflict" as const };
    const prompt = await tx.llmPromptVersion.findFirst({ where: { uuid, settingsUuid: settings.uuid }, select: promptFields });
    if (!prompt) return { status: "invalid" as const };
    if (prompt.uuid !== settings.active_prompt_uuid) {
      await tx.llmSettings.update({ where: { uuid: settings.uuid },
        data: { activePromptUuid: prompt.uuid, updatedByUuid: actorUuid } });
    }
    return { status: "ok" as const, prompt };
  });
}

export function openAiConfigured() {
  return ["OPENAI_API_KEY", "OPENAI_MODEL_INSTANT", "OPENAI_MODEL_THINKING"]
    .every(name => Boolean(process.env[name]?.trim()));
}
