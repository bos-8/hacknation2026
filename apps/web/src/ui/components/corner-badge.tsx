import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cx } from "@/ui/basic/styles";
import { cornerBadgeStyles } from "./styles";

export type CornerBadgeProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  children?: ReactNode;
  value?: string | number | null;
  placement?: keyof typeof cornerBadgeStyles.placements;
  color?: keyof typeof cornerBadgeStyles.colors;
  wrapperClassName?: string;
};

/** TrueGuard-style corner marker. An empty value renders a dot; zero remains visible. */
export function CornerBadge({ children, value, placement = "top-right", color = "green",
  className, wrapperClassName, ...props }: CornerBadgeProps) {
  const visible = value !== undefined && value !== null && String(value).length > 0;
  const shape = !visible ? "dot" : String(value).length > 1 ? "pill" : "count";
  const marker = <span {...props} className={cx(cornerBadgeStyles.marker,
    cornerBadgeStyles.placements[placement], cornerBadgeStyles.colors[color],
    cornerBadgeStyles.shapes[shape], className)}>{visible ? value : null}</span>;

  if (children === undefined || children === null || children === false) return marker;
  return <span className={cx(cornerBadgeStyles.wrapper, wrapperClassName)}>{children}{marker}</span>;
}
