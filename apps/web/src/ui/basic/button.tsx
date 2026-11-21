import { basicStyles, buttonSizes, buttonTones, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";
import { Tooltip } from "./tooltip.tsx";
import type { TooltipPlacement } from "./tooltip-position.ts";

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  tone?: keyof typeof buttonTones;
  size?: keyof typeof buttonSizes;
  tooltip?: string;
  tooltipPlacement?: TooltipPlacement;
};

export function Button({ type = "button", tone = "main", size = "md", className,
  tooltip, tooltipPlacement = "top", ...props }: ButtonProps) {
  const button = <button {...props} type={type} className={cx(
    basicStyles.button,
    buttonTones[tone], buttonSizes[size], className,
  )} />;
  return tooltip ? <Tooltip content={tooltip} placement={tooltipPlacement}>{button}</Tooltip> : button;
}
