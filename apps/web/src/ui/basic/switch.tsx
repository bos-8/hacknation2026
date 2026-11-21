import { cx, toggle } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

type FixedInputProps = Omit<ComponentPropsWithRef<"input">, "type">;

export function Switch({ className, ...props }: FixedInputProps) {
  return <input {...props} type="checkbox" role="switch" className={cx(toggle, className)} />;
}
