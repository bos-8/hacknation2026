import { getTranslations } from "next-intl/server";
import { ArrowLeft, Github, Linkedin } from "react-bootstrap-icons";
import { teamMembers } from "@/config/team";
import { Link } from "@/i18n/navigation";
import { Badge, Heading, Text } from "@/ui/basic";
import { TeamPortrait } from "@/ui/components/team-portrait";

const profiles = [{ key: "linkedin", label: "LinkedIn", icon: Linkedin }, { key: "github", label: "GitHub", icon: Github }] as const;
const profileStyles = "inline-flex size-11 items-center justify-center rounded-md border border-button-border bg-button text-button-foreground";

export async function generateMetadata() {
  const t = await getTranslations("about.team");
  return { title: t("metadataTitle"), description: t("description") };
}

export default async function TeamPage() {
  const t = await getTranslations("about.team");
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="max-w-2xl space-y-4">
        <Badge tone="accent">{t("eyebrow")}</Badge>
        <Heading level={1} className="text-3xl leading-tight sm:text-4xl">{t("title")}</Heading>
        <Text className="text-lg text-muted-foreground">{t("description")}</Text>
      </header>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {teamMembers.map((member, index) => (
          <article key={member.id} className="group/team flex min-w-0 flex-col overflow-hidden rounded-lg border border-panel-border bg-panel text-panel-foreground">
            <div className="relative flex aspect-[5/4] items-center justify-center overflow-hidden border-b border-panel-border bg-accent/10">
              {member.image ? <TeamPortrait image={member.image} imagePosition={member.imagePosition} hoverImage={member.hoverImage} name={member.name} eager={index === 0} /> : (
                <span role="img" aria-label={t("photoPlaceholder")} className="flex size-28 items-center justify-center rounded-full border border-accent/25 bg-panel font-mono text-4xl font-semibold text-accent">{member.initials}</span>
              )}
            </div>
            <div className="flex flex-1 flex-col p-5 sm:p-6">
              <Heading level={2} className="text-xl">{member.name}</Heading>
              {member.roles.length > 0 && <ul className="mt-3 flex flex-wrap gap-2">
                {member.roles.map(role => <li key={role}><Badge tone="accent">{t(role)}</Badge></li>)}
              </ul>}
              {member.profileKey && <>
                <Text className="mt-4 text-sm text-muted-foreground">{t(`${member.profileKey}.bio`)}</Text>
                <blockquote className="mt-4 border-l-2 border-accent/40 pl-3 text-sm font-medium italic">{t(`${member.profileKey}.motto`)}</blockquote>
              </>}
              <div className="mt-auto flex gap-2 pt-5">
                {profiles.map(({ key, label, icon: Icon }) => member[key] ? (
                  <a key={key} href={member[key]} target="_blank" rel="noopener noreferrer" aria-label={t("profileLabel", { provider: label, name: member.name })}
                    className={`${profileStyles} hover:bg-button-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent`}>
                    <Icon aria-hidden="true" className="size-5" />
                  </a>
                ) : null)}
              </div>
            </div>
          </article>
        ))}
      </div>

      <Link href="/about" className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
        <ArrowLeft aria-hidden="true" /> {t("aboutLink")}
      </Link>
    </div>
  );
}
