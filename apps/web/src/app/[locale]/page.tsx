import { getTranslations } from "next-intl/server";
import { ArrowRight, ArrowUpRight, Braces, Key, ShieldLock } from "react-bootstrap-icons";
import { Anchor, Badge, Heading, Text } from "@/ui/basic";
import { Link } from "@/i18n/navigation";
import { ProjectIllustration } from "@/ui/components/project-illustration";

export default async function Home() {
  const t = await getTranslations("home");
  const issuer = process.env.AUTH_ISSUER;
  const adminBase = process.env.AUTH_DIRECTORY_URL || issuer;
  const worker = process.env.PYWORKER_URL ? new URL(process.env.PYWORKER_URL) : null;
  const swagger = worker && ["localhost", "127.0.0.1", "[::1]"].includes(worker.hostname)
    ? new URL("/docs", worker).href : null;
  const services = [
    { key: "authConsole", href: adminBase && new URL("/admin/", adminBase).href, icon: ShieldLock, color: "bg-accent/10 text-accent" },
    { key: "keycloak", href: issuer && `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`, icon: Key, color: "bg-warning/10 text-warning" },
    { key: "swagger", href: swagger, icon: Braces, color: "bg-success/10 text-success" },
  ] as const;
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
        <ProjectIllustration engine />
      </header>

      {services.some(service => service.href) && (
        <nav aria-label={t("services.label")} className="mt-8 grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
          {services.map(({ key, href, icon: Icon, color }) => href && (
            <a key={key} href={href} className="group min-w-0 overflow-hidden rounded-lg border border-panel-border bg-panel text-panel-foreground transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              <div aria-hidden="true" className={`relative flex h-24 items-center justify-between overflow-hidden px-5 ${color}`}>
                <Icon className="size-9" />
                <Icon className="pointer-events-none absolute -bottom-5 right-10 size-24 -rotate-12 opacity-10" />
                <ArrowUpRight className="size-5 motion-safe:transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" />
              </div>
              <div className="p-5">
                <Heading level={2} className="text-lg underline-offset-4 group-hover:underline">{t(`services.${key}.title`)}</Heading>
                <Text className="mt-2 text-sm text-muted-foreground">{t(`services.${key}.description`)}</Text>
              </div>
            </a>
          ))}
        </nav>
      )}

      <nav aria-label={t("access.label")} className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-5 text-sm">
        <Anchor href="mailto:kacper.bos.it@gmail.com">{t("access.contact")}</Anchor>
      </nav>
    </div>
  );
}
