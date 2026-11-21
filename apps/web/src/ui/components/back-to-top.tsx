"use client";

import { ChevronUp } from "react-bootstrap-icons";
import { useTranslations } from "next-intl";
import { IconButton } from "@/ui/basic";
import { cx } from "@/ui/basic/styles";
import { selectorStyles } from "./styles";

export function BackToTop({ className }: { className?: string }) {
  const t = useTranslations("common.footer");
  const label = t("backToTop");
  return <IconButton label={label} tooltip={label} tooltipPlacement="top"
    className={cx(selectorStyles.backToTop, className)}
    onClick={() => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduced ? "instant" : "smooth" });
    }}>
    <ChevronUp className={selectorStyles.symbol} />
  </IconButton>;
}
