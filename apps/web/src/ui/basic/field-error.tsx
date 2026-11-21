import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function FieldError({ className, ...props }: ComponentPropsWithRef<"p"> & { id: string }) {
  return <p role="alert" {...props} className={cx(basicStyles.fieldError, className)} />;
}
