import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Fieldset({ className, ...props }: ComponentPropsWithRef<"fieldset">) {
  return <fieldset {...props} className={cx(basicStyles.fieldset, className)} />;
}
