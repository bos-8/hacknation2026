import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

export function UnorderedList({ className, ...props }: ComponentPropsWithRef<"ul">) {
  return <ul {...props} className={cx(basicStyles.unorderedList, className)} />;
}
