import { getTranslations } from "next-intl/server";
import { ArrowRight, ArrowUpRight, FileEarmarkText, ListTask, ShieldLock, Window } from "react-bootstrap-icons";
import { Anchor, Badge, Heading, Text } from "@/ui/basic";
import { Link } from "@/i18n/navigation";
import { ProjectIllustration } from "@/ui/components/project-illustration";

const capabilities = [
  { key: "identity", icon: ShieldLock, tone: "text-accent", surface: "bg-accent/10" },
  { key: "documents", icon: FileEarmarkText, tone: "text-success", surface: "bg-success/10" },
  { key: "interface", icon: Window, tone: "text-warning", surface: "bg-warning/10" },
  { key: "tasks", icon: ListTask, tone: "text-accent", surface: "bg-accent/10" },
] as const;

export default async function Home() {
  const t = await getTranslations("home");
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-8 sm:px-6 sm:pt-10">
      <header className="grid items-center gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12" aria-labelledby="home-title">
        <div className="max-w-2xl space-y-5">
          <Badge tone="accent">{t("eyebrow")}</Badge>
          <Heading level={1} id="home-title" className="max-w-lg text-4xl leading-tight sm:text-5xl">
            {t("title")}
          </Heading>
          <Text className="max-w-md text-base text-muted-foreground sm:text-lg">{t("description")}</Text>
          <div className="flex flex-wrap items-center gap-5 pt-2 text-sm font-semibold">
            <Link href="/about" className="inline-flex min-h-11 items-center gap-3 rounded-md bg-accent px-5 py-3 text-accent-foreground hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              {t("about")} <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="/about/team" className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              {t("team")} <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
        </div>
        <ProjectIllustration />
      </header>

      <section aria-labelledby="capabilities-title" className="mt-8">
        <Heading level={2} id="capabilities-title" className="sr-only">{t("capabilities.title")}</Heading>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map(({ key, icon: Icon, tone, surface }, index) => (
            <article key={key} className="min-w-0 overflow-hidden rounded-lg border border-panel-border bg-panel text-panel-foreground">
              <div aria-hidden="true" className={`relative flex h-24 items-center justify-between overflow-hidden px-5 ${surface} ${tone}`}>
                <Icon className="size-9" />
                <span className="font-mono text-xs font-semibold opacity-60">0{index + 1}</span>
                <Icon className="pointer-events-none absolute -bottom-5 right-9 size-24 -rotate-12 opacity-10" />
              </div>
              <div className="p-5">
                <Heading level={3} className="text-base">{t(`capabilities.${key}.title`)}</Heading>
                <Text className="mt-2 text-sm text-muted-foreground">{t(`capabilities.${key}.description`)}</Text>
              </div>
            </article>
          ))}
        </div>
      </section>

      <nav aria-label={t("access.label")} className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-5 text-sm">
        <Anchor href="/LICENSE.md">{t("access.license")}</Anchor>
        <Anchor href="mailto:kacper.bos.it@gmail.com">{t("access.contact")}</Anchor>
      </nav>
    </div>
  );
}
