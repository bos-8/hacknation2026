import type { ReactNode } from "react";
import { Button, type ButtonProps } from "./button.tsx";

export function IconButton({ label, children, ...props }: Omit<ButtonProps, "size" | "aria-label"> & {
  label: string;
  children: ReactNode;
}) {
  return <Button {...props} size="icon" aria-label={label}><span aria-hidden="true">{children}</span></Button>;
}
