import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function VerticalDivider({ className, ...props }: ComponentPropsWithRef<"span">) {
  return <span role="separator" aria-orientation="vertical" {...props} className={cx(basicStyles.verticalDivider, className)} />;
}
