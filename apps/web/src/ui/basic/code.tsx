import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Code({ className, ...props }: ComponentPropsWithRef<"code">) {
  return <code {...props} className={cx(basicStyles.code, className)} />;
}
