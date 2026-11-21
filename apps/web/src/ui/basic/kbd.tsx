import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Kbd({ className, ...props }: ComponentPropsWithRef<"kbd">) {
  return <kbd {...props} className={cx(basicStyles.kbd, className)} />;
}
