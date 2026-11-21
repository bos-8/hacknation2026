import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Pre({ className, ...props }: ComponentPropsWithRef<"pre">) {
  return <pre {...props} className={cx(basicStyles.pre, className)} />;
}
