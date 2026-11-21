import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Lock, ShieldLock } from "react-bootstrap-icons";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/schemas/i18n";
import { Heading, Throbber } from "@/ui/basic";
import { basicStyles, buttonSizes, buttonTones, cx } from "@/ui/basic/styles";
import { AuthControl } from "@/ui/components/auth-control";

export async function AccessStatus({ locale, status }: { locale: AppLocale; status: 401 | 403 }) {
  const t = await getTranslations({ locale, namespace: "common" });
  const needsLogin = status === 401;
  const Icon = needsLogin ? Lock : ShieldLock;

  return <section aria-labelledby="access-status-title" className="mx-auto grid w-full max-w-2xl flex-1 place-items-center px-4 py-10 sm:px-6">
    <div className="w-full rounded-lg border border-panel-border bg-panel p-6 text-panel-foreground shadow-panel sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <span className="inline-flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">{status}</span>
      </div>
      <Heading level={1} id="access-status-title">{t(needsLogin ? "admin.loginRequiredTitle" : "admin.deniedTitle")}</Heading>
      <p className="mt-2 max-w-lg text-muted-foreground">{t(needsLogin ? "admin.loginRequiredDescription" : "admin.deniedDescription")}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {needsLogin && <Suspense fallback={<Throbber size="sm" label={t("auth.pending")} />}>
          <AuthControl locale={locale} labels={{
            signIn: t("auth.signIn"), signOut: t("auth.signOut"), pending: t("auth.pending"),
            unavailable: t("auth.unavailable"), error: t("auth.error"), close: t("auth.close"),
          }} />
        </Suspense>}
        <Link href="/" locale={locale} className={cx(basicStyles.button, buttonSizes.sm, buttonTones.main)}>
          <ArrowLeft aria-hidden="true" className="size-4" />{t("admin.home")}
        </Link>
      </div>
    </div>
  </section>;
}
