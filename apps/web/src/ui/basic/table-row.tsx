import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function TableRow({ className, ...props }: ComponentPropsWithRef<"tr">) {
  return <tr {...props} className={cx(basicStyles.tableRow, className)} />;
}
