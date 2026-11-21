import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Summary({ className, ...props }: ComponentPropsWithRef<"summary">) {
  return <summary {...props} className={cx(basicStyles.summary, className)} />;
}
