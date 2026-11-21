import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { footerLegalDocuments, footerLegalLinks } from "@/config/footer";
import { APP_BUILD_YEAR, APP_DISPLAY_VERSION } from "@/config/version";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/schemas/i18n";
import { cx } from "@/ui/basic/styles";
import { LangSelectorButton, ThemeSelectorButton, ContrastSelectorButton, SystemStatus, BackToTop } from "@/ui/components";
import { CookieSettingsButton } from "@/ui/components/cookie-consent";
import { layoutStyles } from "./styles";

export type FooterProps = {
  appName: string;
  companyName: string;
  locale: AppLocale;
  languageCookieName?: string;
  className?: string;
};

export async function Footer({ appName, companyName, locale, languageCookieName, className }: FooterProps) {
  const t = await getTranslations({ locale, namespace: "common" });
  const legalLinks = footerLegalLinks[locale];
  return (
    <footer data-shell-footer className={cx(layoutStyles.footer, className)}>
      <div className="mx-auto w-full max-w-4xl px-5 pt-8 text-center sm:px-8 sm:pt-10">
        <nav aria-label={t("footer.navigation")} className="grid grid-cols-2 gap-x-5 gap-y-6 sm:gap-x-12">
          <div className="min-w-0">
            <h2 className={layoutStyles.footerHeading}>{t("footer.application")}</h2>
            <ul className={layoutStyles.footerLinks}>
              <li><Link href="/about" locale={locale} className={layoutStyles.footerLink}>{t("navigation.about")}</Link></li>
              <li><Link href="/about/team" locale={locale} className={layoutStyles.footerLink}>{t("navigation.team")}</Link></li>
              <li><a href="mailto:kacper.bos.it@gmail.com" className={layoutStyles.footerLink}>{t("footer.contact")}</a></li>
            </ul>
          </div>
          <div className="min-w-0">
            <h2 className={layoutStyles.footerHeading}>{t("footer.policies")}</h2>
            <ul className={layoutStyles.footerLinks}>
              {footerLegalDocuments.map(document => {
                const href = legalLinks?.[document];
                if (href) return <li key={document}><a href={href} className={layoutStyles.footerLink}>{t(`footer.${document}`)}</a></li>;
                if (document === "browserStorage") return null;
                return <li key={document} className="flex min-h-10 flex-wrap items-center justify-center gap-x-2 px-2 py-1 text-muted-foreground">
                  <span>{t(`footer.${document}`)}</span>
                  <span className="text-xs">{t("footer.documentPending")}</span>
                </li>;
              })}
              <li><CookieSettingsButton className={`${layoutStyles.footerLink} cursor-pointer`} /></li>
              <li><a href="/LICENSE.md" target="_blank" rel="noopener noreferrer" className={layoutStyles.footerLink}>{t("footer.license")}</a></li>
            </ul>
          </div>
        </nav>
        <p className="mx-auto mt-6 max-w-2xl border-t border-footer-border px-2 py-4 text-sm leading-relaxed text-muted-foreground">
          {t("footer.description")}
        </p>
      </div>

      <div data-footer-utility className="border-t border-footer-border">
        <div className={layoutStyles.footerContent}>
          <div className={layoutStyles.footerIdentity}>
            <SystemStatus showLabel />
            <span aria-hidden="true" className={layoutStyles.footerSeparator}>•</span>
            <span className="font-medium">{appName}</span>
            <span aria-hidden="true" className={layoutStyles.footerSeparator}>•</span>
            <span>{["©", APP_BUILD_YEAR, companyName].filter(Boolean).join(" ")}</span>
            <span aria-hidden="true" className={layoutStyles.footerSeparator}>•</span>
            <span className="tabular-nums">{APP_DISPLAY_VERSION}</span>
          </div>
          <Suspense fallback={<span className={layoutStyles.preferencesFallback} role="status">{t("navigation.loadingPreferences")}</span>}>
            <div className={layoutStyles.footerActions}>
              <LangSelectorButton cookieName={languageCookieName} className={layoutStyles.footerButton} />
              <ThemeSelectorButton className={layoutStyles.footerButton} />
              <ContrastSelectorButton className={layoutStyles.footerButton} />
              <BackToTop />
            </div>
          </Suspense>
        </div>
      </div>
    </footer>
  );
}
