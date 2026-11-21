import { basicStyles, control, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Textarea({ className, ...props }: ComponentPropsWithRef<"textarea">) {
  return <textarea {...props} className={cx(control, basicStyles.textarea, className)} />;
}
