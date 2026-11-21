import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Legend({ className, ...props }: ComponentPropsWithRef<"legend">) {
  return <legend {...props} className={cx(basicStyles.legend, className)} />;
}
