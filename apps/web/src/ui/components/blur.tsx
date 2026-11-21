import { cloneElement, type ReactElement } from "react";
import { cx } from "@/ui/basic/styles";
import { blurStyles } from "./styles";

export type BlurProps = {
  className?: string;
  children?: ReactElement<{ className?: string }>;
};

/** Wrap a native Dialog to blur its backdrop, or place an empty Blur behind foreground content in a positioned container. */
export function Blur({ children, className }: BlurProps) {
  if (children) return cloneElement(children, {
    className: cx(children.props.className, blurStyles.backdrop, className),
  });
  return <div aria-hidden="true" className={cx(blurStyles.surface, className)} />;
}
