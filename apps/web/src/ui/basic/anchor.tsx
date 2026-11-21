import { basicStyles, cx } from "./styles.ts";
import type { ComponentPropsWithRef } from "react";

/** Native anchor. Use i18n/navigation Link for locale-aware application navigation. */
export function Anchor({ className, ...props }: ComponentPropsWithRef<"a">) {
  return <a {...props} className={cx(basicStyles.anchor, className)} />;
}
