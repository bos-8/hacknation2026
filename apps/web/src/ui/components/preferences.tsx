import { LangSelector } from "./lang-selector";
import { ThemeSelector } from "./theme-selector";
import { ContrastSelector } from "./contrast-selector";
import { cx } from "@/ui/basic/styles";
import { selectorStyles } from "./styles";

/** Optional composition, individual selectors can also be mounted independently. */
export function Preferences({ cookieDomain, compact = false, className }: {
  cookieDomain?: string;
  compact?: boolean;
  className?: string;
}) {
  const variant = compact ? "icon" : "text";
  return <div className={cx(selectorStyles.group, className)}>
    <LangSelector variant={variant} />
    <ThemeSelector variant={variant} cookieDomain={cookieDomain} />
    <ContrastSelector variant={variant} />
  </div>;
}
