import { getTranslations } from "next-intl/server";
import { ArrowRight, ClipboardCheck, ColumnsGap, Download, FileEarmarkArrowUp, FileEarmarkCheck, Folder2Open, PencilSquare } from "react-bootstrap-icons";
import { Badge, Heading, Text } from "@/ui/basic";
import { Link } from "@/i18n/navigation";
import { formFormats } from "@/schemas/form-formats";
import { MAX_FORM_BYTES } from "@/schemas/form-upload";
import { ProjectIllustration } from "@/ui/components/project-illustration";
import { PocCredentials } from "./poc-credentials";

const steps = [
  { key: "upload", icon: FileEarmarkArrowUp },
  { key: "review", icon: FileEarmarkCheck },
  { key: "export", icon: Download },
] as const;

const capabilities = [
  { key: "compare", icon: ColumnsGap },
  { key: "edit", icon: PencilSquare },
  { key: "decisions", icon: ClipboardCheck },
  { key: "manage", icon: Folder2Open },
] as const;

export default async function Home() {
  const t = await getTranslations("home");
  return (
    <div data-home-page className="glass-shell mx-auto pb-8 pt-6 sm:pt-8">
      <header className="grid gap-4 lg:grid-cols-[1.12fr_1fr]" aria-labelledby="home-title">
        <div className="glass-panel flex flex-col justify-center gap-5 p-6 sm:p-9 lg:p-11">
          <Badge tone="accent" className="glass-accent-text self-start">{t("eyebrow")}</Badge>
          <Heading level={1} id="home-title" className="max-w-xl text-4xl leading-[1.08] tracking-tight sm:text-5xl">
            {t("title")}
          </Heading>
          <Text className="max-w-md text-base text-muted-foreground sm:text-lg">{t("description")}</Text>
          <section className="glass-inset p-4" aria-labelledby="poc-login-title">
            <Heading level={2} id="poc-login-title" className="text-base">{t("pocLogin")}</Heading>
            <PocCredentials />
          </section>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-sm font-semibold">
            <Link href="/forms" className="inline-flex min-h-11 items-center gap-3 rounded-xl bg-accent px-5 py-3 text-accent-foreground hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              {t("openForms")} <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="/about" className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              {t("about")}
            </Link>
          </div>
        </div>
        <div className="glass-panel grid place-items-center p-4 sm:p-6">
          <div className="w-full max-w-sm"><ProjectIllustration /></div>
        </div>
      </header>

      <section className="mt-4 glass-panel p-6 sm:p-8" aria-labelledby="home-workflow">
        <Heading level={2} id="home-workflow" className="text-2xl">{t("workflowTitle")}</Heading>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {steps.map(({ key, icon: Icon }) => (
            <li key={key} className="glass-inset min-w-0 p-5">
              <span className="glass-icon mb-4 grid size-11 place-items-center rounded-xl">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <Heading level={3} className="text-base">{t(`workflow.${key}.title`)}</Heading>
              <Text className="mt-2 text-sm text-muted-foreground">{t(`workflow.${key}.description`)}</Text>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-4 glass-panel p-6 sm:p-8" aria-labelledby="home-capabilities">
        <Heading level={2} id="home-capabilities" className="text-2xl">{t("capabilities.title")}</Heading>
        <ul className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {capabilities.map(({ key, icon: Icon }) => (
            <li key={key} className="flex min-w-0 items-start gap-4 border-t border-border pt-5">
              <span className="glass-icon grid size-10 shrink-0 place-items-center rounded-xl">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <Heading level={3} className="text-base">{t(`capabilities.${key}.title`)}</Heading>
                <Text className="mt-2 text-sm text-muted-foreground">{t(`capabilities.${key}.description`)}</Text>
              </div>
            </li>
          ))}
        </ul>
        <Text className="mt-6 text-sm text-muted-foreground">{t("capabilities.availability")}</Text>
      </section>

      <section className="mt-4 glass-panel space-y-5 p-6 sm:p-8" aria-labelledby="home-formats">
        <div>
          <Heading level={2} id="home-formats" className="text-2xl">{t("formats.title")}</Heading>
          <Text className="mt-2 max-w-xl text-sm text-muted-foreground">
            {t("formats.description", { mib: MAX_FORM_BYTES / 1024 ** 2 })}
          </Text>
        </div>
        <ul className="flex flex-wrap gap-2">
          {formFormats.map(({ mime, extensions }) => (
            <li key={mime} className="glass-inset px-3 py-1.5 text-sm font-medium">
              {extensions.map(extension => extension.slice(1).toUpperCase()).join(" / ")}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
