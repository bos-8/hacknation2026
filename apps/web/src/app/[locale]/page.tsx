import { getTranslations } from "next-intl/server";
import { ArrowRight, ArrowUpRight, Braces, Key, ShieldLock } from "react-bootstrap-icons";
import { Badge, Heading, Text } from "@/ui/basic";
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
    { key: "authConsole", href: adminBase && new URL("/admin/", adminBase).href, icon: ShieldLock },
    { key: "keycloak", href: issuer && `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`, icon: Key },
    { key: "swagger", href: swagger, icon: Braces },
  ] as const;
  return (
    <div data-home-page className="glass-shell mx-auto pb-8 pt-6 sm:pt-8">
      <header className="grid gap-4 lg:grid-cols-[1.12fr_1fr]" aria-labelledby="home-title">
        <div className="glass-panel flex flex-col justify-center gap-5 p-6 sm:p-9 lg:p-11">
          <Badge tone="accent" className="glass-accent-text self-start">{t("eyebrow")}</Badge>
          <Heading level={1} id="home-title" className="max-w-xl text-4xl leading-[1.08] tracking-tight sm:text-5xl">
            {t("title")}
          </Heading>
          <Text className="max-w-md text-base text-muted-foreground sm:text-lg">{t("description")}</Text>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-sm font-semibold">
            <Link href="/about" className="inline-flex min-h-11 items-center gap-3 rounded-xl bg-accent px-5 py-3 text-accent-foreground hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              {t("about")} <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="/about/team" className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              {t("team")} <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="glass-panel grid place-items-center p-4 sm:p-6">
          <div className="w-full max-w-sm"><ProjectIllustration engine /></div>
        </div>
      </header>

      {services.some(service => service.href) && (
        <nav aria-label={t("services.label")} className="mt-4 grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
          {services.map(({ key, href, icon: Icon }) => href && (
            <a key={key} href={href} className="glass-panel home-service group flex min-w-0 flex-col gap-4 p-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              <div aria-hidden="true" className="flex items-center justify-between glass-accent-text">
                <span className="glass-icon grid size-11 place-items-center rounded-xl">
                  <Icon className="size-5" />
                </span>
                <ArrowUpRight className="size-4 motion-safe:transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" />
              </div>
              <div>
                <Heading level={2} className="text-lg underline-offset-4 group-hover:underline">{t(`services.${key}.title`)}</Heading>
                <Text className="mt-2 text-sm text-muted-foreground">{t(`services.${key}.description`)}</Text>
              </div>
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
