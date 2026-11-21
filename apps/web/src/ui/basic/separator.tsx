import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Separator({ className, ...props }: ComponentPropsWithRef<"hr">) {
  return <hr {...props} className={cx(basicStyles.separator, className)} />;
}
