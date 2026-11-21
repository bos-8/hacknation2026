import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function TableFoot({ className, ...props }: ComponentPropsWithRef<"tfoot">) {
  return <tfoot {...props} className={cx(basicStyles.tableFoot, className)} />;
}
