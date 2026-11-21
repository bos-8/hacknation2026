import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function TableHeader({ scope = "col", className, actionColumn = false, ...props }: ComponentPropsWithRef<"th"> & { actionColumn?: boolean }) {
  return <th {...props} scope={scope} className={cx(basicStyles.tableHeader, actionColumn && basicStyles.tableActionColumn, className)} />;
}
