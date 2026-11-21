import { basicStyles, cx, headingSizes } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function Heading({ level = 2, className, ...props }: ComponentPropsWithRef<"h2"> & {
  level?: keyof typeof headingSizes;
}) {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  return <Tag {...props} className={cx(basicStyles.heading, headingSizes[level], className)} />;
}
