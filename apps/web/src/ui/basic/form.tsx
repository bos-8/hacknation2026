import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Form({ className, ...props }: ComponentPropsWithRef<"form">) {
  return <form {...props} className={cx(basicStyles.form, className)} />;
}
