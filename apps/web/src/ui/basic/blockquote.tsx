import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Blockquote({ className, ...props }: ComponentPropsWithRef<"blockquote">) {
  return <blockquote {...props} className={cx(basicStyles.blockquote, className)} />;
}
