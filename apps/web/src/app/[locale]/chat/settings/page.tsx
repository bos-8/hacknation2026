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
  return <article className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6 sm:px-6">
    <div>
      <Heading level={2} className="text-xl">{t("title")}</Heading>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
    </div>
    <LlmSettingsForm initial={settings} configured={openAiConfigured()} />
  </article>;
}

export default function Page() {
  return <Suspense fallback={null}><Content /></Suspense>;
}
