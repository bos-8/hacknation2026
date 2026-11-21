import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

type FixedInputProps = Omit<ComponentPropsWithRef<"input">, "type">;

export function Range({ className, ...props }: FixedInputProps) {
  return <input {...props} type="range" className={cx(basicStyles.range, className)} />;
}
