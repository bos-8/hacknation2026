import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Label({ className, ...props }: ComponentPropsWithRef<"label">) {
  return <label {...props} className={cx(basicStyles.label, className)} />;
}
