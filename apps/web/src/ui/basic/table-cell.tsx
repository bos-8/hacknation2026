import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function TableCell({ className, actionColumn = false, ...props }: ComponentPropsWithRef<"td"> & { actionColumn?: boolean }) {
  return <td {...props} className={cx(basicStyles.tableCell, actionColumn && basicStyles.tableActionColumn, className)} />;
}
