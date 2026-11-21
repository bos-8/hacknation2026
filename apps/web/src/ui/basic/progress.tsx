import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Progress({ className, ...props }: ComponentPropsWithRef<"progress">) {
  return <progress {...props} className={cx(basicStyles.progress, className)} />;
}
