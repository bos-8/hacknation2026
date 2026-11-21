import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

/** Open modal dialogs with a ref and showModal(), preserving native focus and Escape behavior. */
export function Dialog({ className, ...props }: ComponentPropsWithRef<"dialog">) {
  return <dialog {...props} className={cx(
    basicStyles.dialog, className,
  )} />;
}
