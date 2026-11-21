import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function OrderedList({ className, ...props }: ComponentPropsWithRef<"ol">) {
  return <ol {...props} className={cx(basicStyles.orderedList, className)} />;
}
