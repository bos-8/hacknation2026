import type { AppLocale } from "@/schemas/i18n";
import { cx } from "@/ui/basic/styles";
import { selectorStyles } from "./styles";

/** Decorative SVG flag, the adjacent text names the language. */
export function LocaleFlag({ locale, className }: { locale: AppLocale; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 60 30" data-locale={locale}
    className={cx(selectorStyles.flag, className)}>
    {locale === "pl" ? <>
      <path fill="#fff" d="M0 0h60v30H0z" />
      <path fill="#dc143c" d="M0 15h60v15H0z" />
    </> : <>
      <path fill="#012169" d="M0 0h60v30H0z" />
      <path stroke="#fff" strokeWidth="6" d="m0 0 60 30M60 0 0 30" />
      <path fill="#c8102e" d="m0 0 30 15h-4L0 2zm60 0L30 15v-2L56 0zM0 30l30-15v2L4 30zm60 0L30 15h4l26 13z" />
      <path stroke="#fff" strokeWidth="10" d="M30 0v30M0 15h60" />
      <path stroke="#c8102e" strokeWidth="6" d="M30 0v30M0 15h60" />
    </>}
  </svg>;
}
