import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Spinner({ label, className, ...props }: Omit<ComponentPropsWithRef<"span">, "children"> & { label: string }) {
  return <span {...props} role="status" className={cx(basicStyles.spinner, className)}>
    <span aria-hidden="true" className={basicStyles.spinnerIndicator} />
    <span className={basicStyles.spinnerLabel}>{label}</span>
  </span>;
}
