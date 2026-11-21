import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function TableHead({ className, ...props }: ComponentPropsWithRef<"thead">) {
  return <thead {...props} className={cx(basicStyles.tableHead, className)} />;
}
