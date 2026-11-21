import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Meter({ className, ...props }: ComponentPropsWithRef<"meter">) {
  return <meter {...props} className={cx(basicStyles.meter, className)} />;
}
