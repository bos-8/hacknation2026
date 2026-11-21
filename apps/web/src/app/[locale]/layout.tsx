import type { Metadata } from "next";
import { Suspense } from "react";
import { PageBreadcrumb } from "@/ui/layout/page-breadcrumb";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getPublicConfig } from "@/config/server";
import { initialDocumentPreferences } from "@/cookies/initial-document";
import { APP_LOCALES, isAppLocale } from "@/schemas/i18n";
import { Navbar, Footer } from "@/ui/layout";
import { CookieConsent } from "@/ui/components/cookie-consent";
import { ThemeProvider } from "@/ui/components/theme-provider";
import { ContrastProvider } from "@/ui/components/contrast-provider";
import { NotificationProvider } from "@/ui/components/notification-provider";
import { AsideProvider, AsideContent } from "@/ui/components/aside-layout";
import "../globals.css";
import "../glass-shell.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return APP_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: "home" });
  return { title: getPublicConfig().APP_NAME, description: t("description") };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const config = getPublicConfig();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* The HTML parser applies preferences on document loads. Client navigations use the providers below. */}
        <div hidden dangerouslySetInnerHTML={{
          __html: `<script id="formiq-initial-preferences">${initialDocumentPreferences(config.THEME_COOKIE_NAME, config.CONTRAST_COOKIE_NAME)}</script>`,
        }} />
        <NextIntlClientProvider>
          <ThemeProvider cookieName={config.THEME_COOKIE_NAME} cookieDomain={config.UI_PREFERENCE_COOKIE_DOMAIN}>
            <ContrastProvider cookieName={config.CONTRAST_COOKIE_NAME} cookieDomain={config.UI_PREFERENCE_COOKIE_DOMAIN}>
              <CookieConsent cookieNames={[config.LANGUAGE_COOKIE_NAME, config.THEME_COOKIE_NAME, config.CONTRAST_COOKIE_NAME]} cookieDomain={config.UI_PREFERENCE_COOKIE_DOMAIN} />
              <NotificationProvider>
              <AsideProvider>
              <AsideContent header={<Navbar languageCookieName={config.LANGUAGE_COOKIE_NAME} appName={config.APP_NAME} locale={locale} cookieDomain={config.UI_PREFERENCE_COOKIE_DOMAIN} />}>
              <Suspense fallback={null}><PageBreadcrumb /></Suspense>
              <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col">{children}</main>
              <Footer languageCookieName={config.LANGUAGE_COOKIE_NAME} appName={config.APP_NAME} companyName={config.APP_COMPANY_NAME} locale={locale} />
              </AsideContent>
              </AsideProvider>
              </NotificationProvider>
            </ContrastProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
