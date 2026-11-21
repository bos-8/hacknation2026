import type { ComponentPropsWithRef } from "react";
import { cx } from "./styles.ts";

export type ThrobberProps = Omit<ComponentPropsWithRef<"span">, "children"> & {
  size?: "sm" | "md" | "lg";
  label?: string;
};

const sizes = { sm: "size-3.5", md: "size-4.5", lg: "size-5.5" } as const;

/** TrueGuard's current-color ring, with a visible localized status label. */
export function Throbber({ size = "md", label, className, ...props }: ThrobberProps) {
  return <span {...props} role={label ? "status" : undefined} aria-hidden={label ? undefined : true}
    className={cx("inline-flex items-center gap-2", className)}>
    <span aria-hidden="true" className={cx("inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none", sizes[size])} />
    {label && <span>{label}</span>}
  </span>;
}
