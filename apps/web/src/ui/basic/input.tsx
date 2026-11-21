import { basicStyles, control, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Input({ type = "text", className, ...props }: ComponentPropsWithRef<"input">) {
  return <input {...props} type={type} className={cx(control,
    basicStyles.input, className)} />;
}
