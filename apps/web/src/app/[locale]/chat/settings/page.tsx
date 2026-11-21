import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { openAiConfigured, readLlmSettings } from "@/server/llm-settings";
import { Heading } from "@/ui/basic";
import { LlmSettingsForm } from "./settings-form";

export const instant = false;

async function Content() {
  await requireAdminAccess();
  const t = await getTranslations("common.admin.llm");
  const settings = await readLlmSettings().catch(() => null);
  return <article className="glass-shell glass-panel mx-auto my-6 max-w-4xl space-y-4 p-5 sm:p-8">
    <div>
      <Heading level={1} className="text-2xl tracking-tight">{t("title")}</Heading>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
    </div>
    <LlmSettingsForm initial={settings} configured={openAiConfigured()} />
  </article>;
}

export default function Page() {
  return <Suspense fallback={null}><Content /></Suspense>;
}
