import type { ComponentPropsWithRef } from "react";

export function Option(props: ComponentPropsWithRef<"option">) {
  return <option {...props} />;
}
