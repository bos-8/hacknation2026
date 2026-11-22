import { getTranslations } from "next-intl/server";
import { ArrowLeft, Github, Linkedin } from "react-bootstrap-icons";
import { teamMembers } from "@/config/team";
import { Link } from "@/i18n/navigation";
import { Badge, Heading, Text } from "@/ui/basic";
import { TeamPortrait } from "@/ui/components/team-portrait";

const profiles = [{ key: "linkedin", label: "LinkedIn", icon: Linkedin }, { key: "github", label: "GitHub", icon: Github }] as const;
const profileStyles = "glass-icon inline-flex size-11 items-center justify-center rounded-xl border border-panel-border hover:border-accent";

export async function generateMetadata() {
  const t = await getTranslations("about.team");
  return { title: t("metadataTitle"), description: t("description") };
}

export default async function TeamPage() {
  const t = await getTranslations("about.team");
  return (
    <div data-team-page className="glass-shell mx-auto pb-8 pt-6 sm:pt-8">
      <header className="glass-panel space-y-4 p-6 sm:p-9 lg:p-11" aria-labelledby="team-title">
        <Badge tone="accent" className="glass-accent-text">{t("eyebrow")}</Badge>
        <Heading level={1} id="team-title" className="text-4xl leading-[1.08] tracking-tight sm:text-5xl">{t("title")}</Heading>
        <Text className="max-w-2xl text-base text-muted-foreground sm:text-lg">{t("description")}</Text>
      </header>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teamMembers.map((member, index) => (
          <article key={member.id} className="glass-panel group/team flex min-w-0 flex-col p-3">
            <div className="glass-inset relative flex aspect-[5/4] items-center justify-center overflow-hidden">
              {member.image ? <TeamPortrait image={member.image} imagePosition={member.imagePosition} hoverImage={member.hoverImage} name={member.name} eager={index === 0} /> : (
                <span role="img" aria-label={t("photoPlaceholder")} className="flex size-28 items-center justify-center rounded-full border border-accent/25 bg-panel font-mono text-4xl font-semibold text-accent">{member.initials}</span>
              )}
            </div>
            <div className="flex flex-1 flex-col px-3 pb-3 pt-5 sm:px-4 sm:pb-4">
              <Heading level={2} className="text-xl">{member.name}</Heading>
              {member.roles.length > 0 && <ul className="mt-3 flex flex-wrap gap-2">
                {member.roles.map(role => <li key={role}><Badge tone="accent" className="glass-accent-text">{t(role)}</Badge></li>)}
              </ul>}
              {member.profileKey && <>
                {t.has(`${member.profileKey}.bio`) && <Text className="mt-4 text-sm text-muted-foreground">{t(`${member.profileKey}.bio`)}</Text>}
                <blockquote className="mt-4 border-l-2 border-accent/40 pl-3 text-sm font-medium italic">{t(`${member.profileKey}.motto`)}</blockquote>
              </>}
              <div className="mt-auto flex gap-2 pt-5">
                {profiles.map(({ key, label, icon: Icon }) => member[key] ? (
                  <a key={key} href={member[key]} target="_blank" rel="noopener noreferrer" aria-label={t("profileLabel", { provider: label, name: member.name })}
                    className={`${profileStyles} focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent`}>
                    <Icon aria-hidden="true" className="size-5" />
                  </a>
                ) : null)}
              </div>
            </div>
          </article>
        ))}
      </div>

      <Link href="/about" className="glass-panel glass-accent-text mt-4 inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
        <ArrowLeft aria-hidden="true" /> {t("aboutLink")}
      </Link>
    </div>
  );
}
