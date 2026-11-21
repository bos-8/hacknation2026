"use client";

import { useTranslations } from "next-intl";
import { Display, MoonStars, Sun } from "react-bootstrap-icons";
import { getNextTheme, THEME_OPTIONS } from "@/schemas/theme";
import { Button, type TooltipPlacement } from "@/ui/basic";
import { cx } from "@/ui/basic/styles";
import { useTheme } from "./theme-provider";
import { selectorStyles } from "./styles";

const icons = { system: Display, dark: MoonStars, light: Sun };
export type ThemeSelectorProps = { variant?: "icon" | "text"; className?: string; tooltipPlacement?: TooltipPlacement; cookieDomain?: string };

export function ThemeSelector({ variant = "text", tooltipPlacement, className, cookieDomain }: ThemeSelectorProps) {
  const { theme, ready, selectTheme } = useTheme();
  const t = useTranslations("common");
  const next = getNextTheme(theme);
  const label = t("themeSwitchTo", { theme: t(`themes.${next}`) });

  return <Button
    size={variant === "icon" ? "icon" : "sm"}
    className={cx(selectorStyles[variant], className)}
    aria-label={label}
    tooltip={label}
    tooltipPlacement={tooltipPlacement ?? (variant === "icon" ? "bottom" : "top")}
    disabled={!ready}
    aria-busy={!ready}
    onClick={() => selectTheme(getNextTheme, cookieDomain)}
  >
    <span aria-hidden="true" className={selectorStyles.themeSymbol}>
      {THEME_OPTIONS.map((value) => {
        const Icon = icons[value];
        return <Icon key={value} data-active={theme === value} className={selectorStyles.themeIcon} />;
      })}
    </span>
    {variant === "text" && <span>{t(`themes.${theme}`)}</span>}
  </Button>;
}
