import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Table({ className, ...props }: ComponentPropsWithRef<"table">) {
  return <table {...props} className={cx(basicStyles.table, className)} />;
}
