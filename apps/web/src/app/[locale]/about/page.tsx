import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight, FileEarmarkText, Layers, Window, Cpu } from "react-bootstrap-icons";
import { Link } from "@/i18n/navigation";
import { Badge, Heading, Text } from "@/ui/basic";
import { ProjectIllustration } from "@/ui/components/project-illustration";

const features = [
  { key: "import", icon: FileEarmarkText },
  { key: "structure", icon: Layers },
  { key: "review", icon: Window },
  { key: "runtime", icon: Cpu },
] as const;

export async function generateMetadata() {
  const t = await getTranslations("about");
  return { title: t("metadataTitle"), description: t("description") };
}

export default async function AboutPage() {
  const t = await getTranslations("about");
  return (
    <div data-about-page className="glass-shell mx-auto pb-8 pt-6 sm:pt-8">
      <header className="grid gap-4 lg:grid-cols-[1.12fr_1fr]" aria-labelledby="about-title">
        <div className="glass-panel flex flex-col justify-center gap-5 p-6 sm:p-9 lg:p-11">
          <Badge tone="accent" className="glass-accent-text self-start">{t("eyebrow")}</Badge>
          <Heading level={1} id="about-title" className="max-w-xl text-4xl leading-[1.08] tracking-tight sm:text-5xl">{t("title")}</Heading>
          <Text className="max-w-xl text-lg text-foreground">{t("description")}</Text>
          <div className="flex flex-wrap items-center gap-5 pt-2">
            <Link href="/about/team" className="inline-flex min-h-11 items-center gap-3 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              {t("teamLink")} <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="glass-panel grid place-items-center p-4 sm:p-6">
          <div className="w-full max-w-sm"><ProjectIllustration /></div>
        </div>
      </header>

      <section className="glass-panel mt-4 p-6 sm:p-8" aria-labelledby="about-flow">
        <Heading level={2} id="about-flow" className="text-2xl">{t("flow.title")}</Heading>
        <div className="mt-5 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <div className="glass-inset h-full border-l-4 border-l-accent p-5">
            <Heading level={3} className="text-lg">{t("flow.worker")}</Heading>
            <code className="text-sm glass-accent-text">POST /v1/forms/process</code>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
              {(["validate", "extract", "compile"] as const).map(step => <li key={step}>{t(`flow.${step}`)}</li>)}
            </ol>
          </div>
          <div className="grid justify-items-center gap-2 text-sm font-medium glass-accent-text">
            <span className="flex items-center gap-2"><ArrowLeft aria-hidden="true" className="rotate-90 lg:rotate-0" />{t("flow.request")}</span>
            <span className="flex items-center gap-2">{t("flow.response")}<ArrowRight aria-hidden="true" className="rotate-90 lg:rotate-0" /></span>
          </div>
          <div className="glass-inset h-full p-5">
            <Heading level={3} className="text-lg">{t("flow.workspace")}</Heading>
            <dl className="mt-4 grid gap-3 text-sm">
              {([["Next.js", "web"], ["Keycloak", "identity"], ["PostgreSQL", "database"], ["SeaweedFS", "storage"]] as const).map(([name, role]) => (
                <div key={name}>
                  <dt className="font-semibold">{name}</dt>
                  <dd className="text-muted-foreground">{t(`flow.${role}`)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="glass-panel mt-4 p-6 sm:p-8" aria-labelledby="about-scope">
        <Heading level={2} id="about-scope" className="text-2xl">{t("scopeTitle")}</Heading>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {features.map(({ key, icon: Icon }) => (
            <article key={key} className="glass-inset p-5">
              <Icon aria-hidden="true" className="glass-accent-text mb-3 size-6" />
              <Heading level={3} className="text-lg">{t(`scope.${key}.title`)}</Heading>
              <Text className="mt-2 text-sm text-muted-foreground">{t(`scope.${key}.description`)}</Text>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
