import { getTranslations } from "next-intl/server";
import { ArrowDown, ArrowRight, BoxSeam, Check2, Check2Circle, Cloud, Cpu, Database, FileEarmarkText, HddStack, Laptop, Layers, ListTask, People, ShieldLock, Window } from "react-bootstrap-icons";
import { Link } from "@/i18n/navigation";
import { Badge, Heading, Text } from "@/ui/basic";
import { ProjectIllustration } from "@/ui/components/project-illustration";

const features = [
  { key: "identity", icon: ShieldLock, tone: "text-accent", surface: "bg-accent/10" },
  { key: "files", icon: FileEarmarkText, tone: "text-success", surface: "bg-success/10" },
  { key: "workspace", icon: Window, tone: "text-warning", surface: "bg-warning/10" },
  { key: "tasks", icon: ListTask, tone: "text-accent", surface: "bg-accent/10" },
] as const;
const principles = [{ key: "reuse", icon: Layers }, { key: "access", icon: ShieldLock }, { key: "visibility", icon: Check2Circle }] as const;
const workflow = [{ key: "access", icon: ShieldLock }, { key: "work", icon: FileEarmarkText }, { key: "process", icon: ListTask }, { key: "result", icon: Check2Circle }] as const;
const flow = [{ key: "browser", icon: Laptop }, { key: "web", icon: BoxSeam }, { key: "data", icon: Database }] as const;
const technologies = [
  { key: "web", name: "Next.js", icon: Window },
  { key: "auth", name: "Keycloak", icon: ShieldLock },
  { key: "database", name: "PostgreSQL", icon: Database },
  { key: "storage", name: "SeaweedFS", icon: HddStack },
  { key: "queue", name: "pg-boss", icon: ListTask },
  { key: "python", name: "Python", icon: Cpu },
] as const;
const environments = [{ key: "dev", icon: Laptop }, { key: "qa", icon: BoxSeam }, { key: "prod", icon: Cloud }] as const;
const chapters = [{ key: "idea", href: "#about-idea" }, { key: "modules", href: "#about-modules" }, { key: "workflow", href: "#about-workflow" }, { key: "architecture", href: "#about-architecture" }, { key: "development", href: "#about-development" }] as const;

function SectionHeading({ id, label, title, description }: { id: string; label?: string; title: string; description?: string }) {
  return <div className="max-w-3xl space-y-3">
    {label && <Text className="text-xs font-semibold uppercase tracking-widest text-accent">{label}</Text>}
    <Heading level={2} id={id} className="text-2xl leading-tight sm:text-3xl">{title}</Heading>
    {description && <Text className="text-muted-foreground">{description}</Text>}
  </div>;
}

export async function generateMetadata() {
  const t = await getTranslations("about");
  return { title: t("metadataTitle"), description: t("description") };
}

export default async function AboutPage() {
  const t = await getTranslations("about");
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="grid items-center gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        <div className="space-y-5">
          <Badge tone="accent">{t("eyebrow")}</Badge>
          <Heading level={1} className="max-w-2xl text-4xl leading-tight sm:text-5xl">{t("title")}</Heading>
          <Text className="max-w-xl text-lg text-foreground">{t("description")}</Text>
          <Text className="max-w-xl text-muted-foreground">{t("intro")}</Text>
          <div className="flex flex-wrap items-center gap-5 pt-2">
            <Link href="/about/team" className="inline-flex min-h-11 items-center gap-3 rounded-md bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              {t("teamLink")} <ArrowRight aria-hidden="true" />
            </Link>
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Layers aria-hidden="true" className="size-4 text-accent" />{t("currentLabel")}</span>
          </div>
        </div>
        <ProjectIllustration />
      </header>

      <nav aria-label={t("contentsLabel")} className="mt-10 flex flex-wrap gap-x-2 gap-y-2 border-y border-border py-4 sm:mt-12">
        {chapters.map(({ key, href }, index) => <a key={key} href={href} className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent/10 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <span aria-hidden="true" className="font-mono text-xs text-accent">0{index + 1}</span>{t(`sections.${key}`)}
        </a>)}
      </nav>

      <div className="space-y-16 pt-12 sm:space-y-20 sm:pt-16">
        <section id="about-idea" aria-labelledby="about-idea-title">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
            <SectionHeading id="about-idea-title" label={t("idea.label")} title={t("idea.title")} description={t("idea.description")} />
            <Text className="self-end border-l-2 border-accent/30 pl-5 text-sm text-muted-foreground">{t("idea.detail")}</Text>
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {principles.map(({ key, icon: Icon }) => <div key={key} className="min-w-0 border-t border-border pt-5">
              <Icon aria-hidden="true" className="mb-4 size-7 text-accent" />
              <Heading level={3} className="text-base">{t(`idea.${key}.title`)}</Heading>
              <Text className="mt-2 text-sm text-muted-foreground">{t(`idea.${key}.description`)}</Text>
            </div>)}
          </div>
        </section>

        <section id="about-modules" aria-labelledby="about-scope">
          <SectionHeading id="about-scope" title={t("scopeTitle")} description={t("scopeDescription")} />
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            {features.map(({ key, icon: Icon, tone, surface }, index) => <article key={key} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-panel-border bg-panel text-panel-foreground">
              <div aria-hidden="true" className={`relative flex h-24 items-center justify-between overflow-hidden px-6 ${surface} ${tone}`}>
                <Icon className="size-9" /><span className="font-mono text-sm font-semibold">0{index + 1}</span>
                <Icon className="absolute -bottom-8 right-14 size-32 -rotate-12 opacity-10" />
              </div>
              <div className="flex flex-1 flex-col p-5 sm:p-6">
                <Heading level={3} className="text-lg">{t(`scope.${key}.title`)}</Heading>
                <Text className="mb-5 mt-3 text-sm text-muted-foreground">{t(`scope.${key}.description`)}</Text>
                <ul className="mt-auto space-y-2 border-t border-border pt-4">
                  {(["first", "second", "third"] as const).map(item => <li key={item} className="flex items-center gap-2 text-sm"><Check2 aria-hidden="true" className={`size-4 shrink-0 ${tone}`} />{t(`scope.${key}.${item}`)}</li>)}
                </ul>
              </div>
            </article>)}
          </div>
        </section>

        <section id="about-workflow" aria-labelledby="about-workflow-title">
          <SectionHeading id="about-workflow-title" title={t("workflowTitle")} description={t("workflowDescription")} />
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map(({ key, icon: Icon }, index) => <li key={key} className="relative min-w-0 border-l-2 border-accent/25 pl-5">
              <div className="mb-5 flex items-center gap-3"><span className="inline-flex size-11 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon aria-hidden="true" className="size-5" /></span><span aria-hidden="true" className="font-mono text-xs font-semibold text-accent">0{index + 1}</span></div>
              <Heading level={3} className="text-base">{t(`workflow.${key}.title`)}</Heading>
              <Text className="mt-3 text-sm text-muted-foreground">{t(`workflow.${key}.description`)}</Text>
            </li>)}
          </ol>
        </section>

        <section id="about-architecture" aria-labelledby="about-architecture-title">
          <SectionHeading id="about-architecture-title" label={t("architecture.label")} title={t("architecture.title")} description={t("architecture.description")} />
          <div className="mt-7 overflow-hidden rounded-lg border border-panel-border bg-panel p-5 text-panel-foreground sm:p-8">
            <ol className="grid gap-8 md:grid-cols-3">
              {flow.map(({ key, icon: Icon }, index) => <li key={key} className="relative flex min-w-0 flex-col items-center text-center">
                <div className={`flex size-16 items-center justify-center rounded-xl border ${key === "web" ? "border-accent bg-accent/10 text-accent" : "border-panel-border bg-background text-muted-foreground"}`}><Icon aria-hidden="true" className="size-7" /></div>
                <Heading level={3} className="mt-4 text-base">{t(`architecture.${key}.title`)}</Heading>
                <Text className="mt-1 text-xs text-muted-foreground">{t(`architecture.${key}.detail`)}</Text>
                {index < flow.length - 1 && <><ArrowRight aria-hidden="true" className="absolute -right-6 top-5 hidden size-5 text-accent/60 md:block" /><ArrowDown aria-hidden="true" className="mt-5 size-4 text-accent/60 md:hidden" /></>}
              </li>)}
            </ol>
            <div className="my-6 flex items-center gap-3"><span aria-hidden="true" className="h-px flex-1 bg-border" /><Text className="text-center text-xs text-muted-foreground">{t("architecture.supportTitle")}</Text><span aria-hidden="true" className="h-px flex-1 bg-border" /></div>
            <ul className="grid gap-3 sm:grid-cols-3">
              {[{ key: "identity", icon: ShieldLock }, { key: "queue", icon: ListTask }, { key: "python", icon: Cpu }].map(({ key, icon: Icon }) => <li key={key} className="flex items-center justify-center gap-2 rounded-md border border-panel-border px-3 py-3 text-sm"><Icon aria-hidden="true" className="size-4 shrink-0 text-accent" /><span>{t(`architecture.${key}`)}</span></li>)}
            </ul>
            <Text className="mt-6 text-center text-xs text-muted-foreground">{t("architecture.note")}</Text>
          </div>
          <Heading level={3} className="mb-4 mt-8 text-lg">{t("technologyTitle")}</Heading>
          <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {technologies.map(({ key, name, icon: Icon }) => <li key={key} className="flex min-w-0 gap-3 border-t border-border pt-4"><Icon aria-hidden="true" className="mt-1 size-5 shrink-0 text-accent" /><div><span className="text-sm font-semibold">{name}</span><Text className="mt-1 text-xs text-muted-foreground">{t(`technologies.${key}`)}</Text></div></li>)}
          </ul>
        </section>

        <section aria-labelledby="about-environments-title">
          <SectionHeading id="about-environments-title" title={t("environments.title")} description={t("environments.description")} />
          <div className="mt-7 grid gap-4 lg:grid-cols-3">
            {environments.map(({ key, icon: Icon }) => <article key={key} className={`min-w-0 rounded-lg border bg-panel p-5 text-panel-foreground ${key === "prod" ? "border-dashed border-panel-border" : "border-panel-border"}`}>
              <div className="mb-5 flex items-center justify-between gap-3"><Icon aria-hidden="true" className="size-7 text-accent" /><span className="font-mono text-xs font-semibold uppercase">{key}</span></div>
              <Badge tone={key === "prod" ? "neutral" : "accent"}>{t(key === "prod" ? "environments.planned" : "environments.available")}</Badge>
              <Heading level={3} className="mt-4 text-base">{t(`environments.${key}.title`)}</Heading>
              <Text className="mt-2 text-sm text-muted-foreground">{t(`environments.${key}.description`)}</Text>
            </article>)}
          </div>
        </section>

        <section id="about-development" aria-labelledby="about-direction">
          <SectionHeading id="about-direction" label={t("directionLabel")} title={t("directionTitle")} description={t("directionDescription")} />
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            {[{ key: "local", icon: Cpu }, { key: "cloud", icon: Cloud }].map(({ key, icon: Icon }) => <article key={key} className="relative min-w-0 overflow-hidden rounded-lg border border-dashed border-accent/35 bg-panel p-5 text-panel-foreground sm:p-6">
              <Icon aria-hidden="true" className="absolute -right-4 -top-4 size-32 text-accent opacity-5" />
              <Icon aria-hidden="true" className="mb-5 size-8 text-accent" />
              <span className="font-mono text-xs font-semibold text-accent">{t(`ai.${key}Path`)}</span>
              <Heading level={3} className="mt-3 text-lg">{t(`ai.${key}Title`)}</Heading>
              <Text className="mt-3 text-sm text-muted-foreground">{t(`ai.${key}Description`)}</Text>
            </article>)}
          </div>
          <div className="mt-5 flex items-start gap-3 rounded-md bg-accent/10 p-4"><ShieldLock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" /><Text className="text-sm text-muted-foreground">{t("ai.note")}</Text></div>
        </section>

        <section aria-labelledby="about-team-cta" className="flex flex-col gap-6 border-t border-border py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex max-w-2xl items-start gap-4"><People aria-hidden="true" className="mt-1 size-8 shrink-0 text-accent" /><div><Heading level={2} id="about-team-cta" className="text-xl">{t("teamCta.title")}</Heading><Text className="mt-2 text-sm text-muted-foreground">{t("teamCta.description")}</Text></div></div>
          <Link href="/about/team" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-3 rounded-md bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">{t("teamLink")} <ArrowRight aria-hidden="true" /></Link>
        </section>
      </div>
    </div>
  );
}
