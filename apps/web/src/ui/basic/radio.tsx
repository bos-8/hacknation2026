import { cx, toggle } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

type FixedInputProps = Omit<ComponentPropsWithRef<"input">, "type">;

export function Radio({ className, ...props }: FixedInputProps) {
  return <input {...props} type="radio" className={cx(toggle, className)} />;
}
