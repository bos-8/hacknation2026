import { badgeTones, basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Badge({ tone = "neutral", className, ...props }: ComponentPropsWithRef<"span"> & {
  tone?: keyof typeof badgeTones;
}) {
  return <span {...props} className={cx(basicStyles.badge, badgeTones[tone], className)} />;
}
