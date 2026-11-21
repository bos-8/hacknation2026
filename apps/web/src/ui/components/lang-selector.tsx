"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Translate } from "react-bootstrap-icons";
import { LANGUAGE_COOKIE_KEY, persistLanguage } from "@/cookies";
import { usePathname, useRouter } from "@/i18n/navigation";
import { DEFAULT_LOCALE, LOCALE_META, getNextLocale, isAppLocale } from "@/schemas/i18n";
import { Button, type TooltipPlacement } from "@/ui/basic";
import { cx } from "@/ui/basic/styles";
import { selectorStyles } from "./styles";
import { LocaleFlag } from "./locale-flag";

export type LangSelectorProps = { cookieName?: string; variant?: "icon" | "text"; className?: string; tooltipPlacement?: TooltipPlacement };

export function LangSelector({ variant = "text", cookieName = LANGUAGE_COOKIE_KEY, tooltipPlacement, className }: LangSelectorProps) {
  const requestedLocale = useLocale();
  const t = useTranslations("common");
  const locale = isAppLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;
  const current = LOCALE_META.find((item) => item.code === locale)!;
  const nextLocale = getNextLocale(locale);
  const next = LOCALE_META.find((item) => item.code === nextLocale)!;
  const switchLabel = t(`languageSwitchTo.${nextLocale}`);
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return <Button
    size={variant === "icon" ? "icon" : "sm"}
    className={cx(selectorStyles[variant], variant === "text" && "group", className)}
    aria-label={switchLabel}
    tooltip={switchLabel}
    tooltipPlacement={tooltipPlacement ?? (variant === "icon" ? "bottom" : "top")}
    lang={locale}
    disabled={pending}
    aria-busy={pending}
    onClick={() => {
      persistLanguage(nextLocale, cookieName);
      startTransition(() => {
        router.replace(`${pathname}${window.location.search}${window.location.hash}`, { locale: nextLocale, scroll: false });
      });
    }}
  >
    {variant === "icon" ? <Translate aria-hidden="true" className={selectorStyles.symbol} /> :
      <span aria-hidden="true" className={selectorStyles.languagePreview}>
        <span lang={current.code} data-preview="current" className={cx(selectorStyles.languageLabel, selectorStyles.languageCurrent)}>
          <LocaleFlag locale={current.code} />{current.label}
        </span>
        <span lang={next.code} data-preview="next" className={cx(selectorStyles.languageLabel, selectorStyles.languageNext)}>
          <LocaleFlag locale={next.code} />{next.label}
        </span>
      </span>}
  </Button>;
}
