import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Text({ className, ...props }: ComponentPropsWithRef<"p">) {
  return <p {...props} className={cx(basicStyles.text, className)} />;
}
