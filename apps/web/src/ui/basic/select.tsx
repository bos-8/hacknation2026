import { control, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Select({ className, ...props }: ComponentPropsWithRef<"select">) {
  return <select {...props} className={cx(control, className)} />;
}
