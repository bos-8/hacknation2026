import { basicStyles, cx, toggle } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

type FixedInputProps = Omit<ComponentPropsWithRef<"input">, "type">;

export function Checkbox({ className, ...props }: FixedInputProps) {
  return <input {...props} type="checkbox" className={cx(toggle, basicStyles.checkbox, className)} />;
}
