"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Heading } from "@/ui/basic";
import { useForms } from "../workspace";

export default function FormDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("forms");
  const entry = useForms().entries.find(item => item.id === id);
  return <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-8 sm:px-6">
    <Link href="/forms" className="text-accent underline">{t("back")}</Link>
    <Heading level={1} className="break-words">{entry?.file.name || t("detailsTitle")}</Heading>
    {entry ? <div className="grid gap-4 lg:grid-cols-2">
      <section className="min-w-0 overflow-hidden rounded-lg border border-panel-border bg-panel">
        <Heading level={2} className="border-b border-panel-border p-4 text-lg">{t("original")}</Heading>
        {entry.result.media_type === "application/pdf"
          ? <iframe src={entry.previewUrl} title={entry.file.name} className="h-[65vh] w-full" />
          : entry.result.media_type.startsWith("image/")
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={entry.previewUrl} alt={entry.file.name} className="mx-auto max-h-[70vh] max-w-full object-contain" />
          : ["text/plain", "application/json"].includes(entry.result.media_type)
            ? <iframe sandbox="" src={entry.previewUrl} title={entry.file.name} className="h-[65vh] w-full" />
            : <div className="space-y-2 p-4"><p className="break-words">{entry.file.name}</p>
                <a download={entry.file.name} href={entry.previewUrl} className="text-primary underline">{t("downloadOriginal")}</a>
              </div>}
      </section>
      <section className="min-w-0 rounded-lg border border-panel-border bg-panel">
        <Heading level={2} className="border-b border-panel-border p-4 text-lg">{t("json")}</Heading>
        <pre className="overflow-auto p-4 text-sm">{JSON.stringify(entry.result, null, 2)}</pre>
      </section>
    </div> : <p>{t("missing")}</p>}
  </main>;
}
