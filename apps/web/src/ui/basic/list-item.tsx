import type { ComponentPropsWithRef } from "react";

export function ListItem(props: ComponentPropsWithRef<"li">) {
  return <li {...props} />;
}
