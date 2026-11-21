import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Details({ className, ...props }: ComponentPropsWithRef<"details">) {
  return <details {...props} className={cx(basicStyles.details, className)} />;
}
