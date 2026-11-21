import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Output({ className, ...props }: ComponentPropsWithRef<"output">) {
  return <output {...props} className={cx(basicStyles.output, className)} />;
}
