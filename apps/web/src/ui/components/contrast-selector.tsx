"use client";

import { useTranslations } from "next-intl";
import { CircleHalf } from "react-bootstrap-icons";
import { getNextContrast } from "@/schemas/contrast";
import { Button, type TooltipPlacement } from "@/ui/basic";
import { cx } from "@/ui/basic/styles";
import { useContrast } from "./contrast-provider";
import { selectorStyles } from "./styles";

export type ContrastSelectorProps = { variant?: "icon" | "text"; className?: string; tooltipPlacement?: TooltipPlacement };

export function ContrastSelector({ variant = "text", tooltipPlacement, className }: ContrastSelectorProps) {
  const { contrast, ready, selectContrast } = useContrast();
  const t = useTranslations("common");
  return <Button
    size={variant === "icon" ? "icon" : "sm"}
    className={cx(selectorStyles[variant], className)}
    aria-label={t("contrast")}
    aria-pressed={contrast === "high"}
    tooltip={t("contrast")}
    tooltipPlacement={tooltipPlacement ?? (variant === "icon" ? "bottom" : "top")}
    disabled={!ready}
    aria-busy={!ready}
    onClick={() => selectContrast(getNextContrast)}
  >
    <CircleHalf
      aria-hidden="true"
      data-contrast={contrast}
      className={cx(selectorStyles.symbol, selectorStyles.contrastIcon)}
    />
    {variant === "text" && <span>{t(`contrasts.${contrast}`)}</span>}
  </Button>;
}
