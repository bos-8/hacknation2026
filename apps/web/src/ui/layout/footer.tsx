import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import type { AppLocale } from "@/schemas/i18n";
import { cx } from "@/ui/basic/styles";
import { layoutStyles } from "./styles";
import { LangSelectorButton, ThemeSelectorButton, ContrastSelectorButton, SystemStatus, BackToTop } from "@/ui/components";
import { APP_BUILD_YEAR, APP_DISPLAY_VERSION } from "@/config/version";

export type FooterProps = {
  appName: string;
  companyName: string;
  locale: AppLocale;
  languageCookieName?: string;
  className?: string;
};

export async function Footer({ appName, companyName, locale, languageCookieName, className }: FooterProps) {
  const t = await getTranslations({ locale, namespace: "common" });
  return (
    <footer data-shell-footer className={cx(layoutStyles.footer, className)}>
      <div className={layoutStyles.footerContent}>
        <div className={layoutStyles.footerIdentity}>
          <SystemStatus />
          <span className="font-medium">{appName}</span>
          <span aria-hidden="true" className={layoutStyles.footerSeparator}>•</span>
          <span>{["©", APP_BUILD_YEAR, companyName].filter(Boolean).join(" ")}</span>
          <span aria-hidden="true" className={layoutStyles.footerSeparator}>•</span>
          <a href="/LICENSE.md" target="_blank" rel="noopener noreferrer" className={layoutStyles.footerLink}>
            {t("footer.license")}
          </a>
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
    </footer>
  );
}
