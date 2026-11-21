import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function TableCaption({ className, ...props }: ComponentPropsWithRef<"caption">) {
  return <caption {...props} className={cx(basicStyles.tableCaption, className)} />;
}
