import Image from "next/image";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/schemas/i18n";
import { Link } from "@/i18n/navigation";
import { AuthButton } from "@/ui/components/auth-button";
import { LangSelectorIcon } from "@/ui/components/lang-selector-icon";
import { ThemeSelectorIcon } from "@/ui/components/theme-selector-icon";
import { ContrastSelectorIcon } from "@/ui/components/contrast-selector-icon";
import { NavbarFrame } from "./navbar-frame";
import { PrimaryNavigation, SecondaryNavigation } from "./navbar-navigation";
import { layoutStyles } from "./styles";
import { getAdminAccess } from "@/server/auth/admin-access";
import { getAccess } from "@/server/auth/access";
import { LOGGED_ACCESS, ROLE_LEVELS } from "@/schemas/access";

async function AuthorizedNavigation({ secondary = false }: { secondary?: boolean }) {
  if (secondary) return <SecondaryNavigation allowAdmin={await getAdminAccess() === "allowed"} />;
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status !== "allowed" || !access.context.actorUuid) return <PrimaryNavigation />;
  return <PrimaryNavigation signedIn allowAdmin={(access.context.roleLevel ?? 0) >= ROLE_LEVELS.ADMIN} />;
}

export type NavbarProps = {
  appName: string;
  locale: AppLocale;
  languageCookieName?: string;
  cookieDomain?: string;
  className?: string;
};

export async function Navbar({ appName, locale, languageCookieName, cookieDomain = "", className }: NavbarProps) {
  const t = await getTranslations({ locale, namespace: "common.navigation" });
  const auth = await getTranslations({ locale, namespace: "common.auth" });
  return (
    <NavbarFrame className={className}>
      <a href="#main-content" className={layoutStyles.skipLink}>{t("skipContent")}</a>
      <div data-navbar-main className={layoutStyles.navbarContent}>
        <Link href="/" locale={locale} aria-label={appName} className={layoutStyles.brand}>
          <Image src="/logo.png" alt="" width={24} height={24} className={layoutStyles.brandLogo} />
          <span className="navbar-brand-name hidden @min-[1024px]/navbar:inline-block">{appName}</span>
        </Link>
        <Suspense fallback={<PrimaryNavigation />}><AuthorizedNavigation /></Suspense>
        <div className={layoutStyles.navbarActions}>
          <Suspense fallback={<span className={layoutStyles.preferencesFallback} aria-hidden="true" />}>
            <div className={layoutStyles.selectors}>
              <LangSelectorIcon cookieName={languageCookieName} />
              <ThemeSelectorIcon cookieDomain={cookieDomain || undefined} />
              <ContrastSelectorIcon />
            </div>
          </Suspense>
          <Suspense fallback={<span className="text-sm" role="status">{auth("pending")}</span>}>
            <AuthButton locale={locale} />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={<SecondaryNavigation />}><AuthorizedNavigation secondary /></Suspense>
    </NavbarFrame>
  );
}

