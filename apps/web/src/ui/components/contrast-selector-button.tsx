import { ContrastSelector, type ContrastSelectorProps } from "./contrast-selector";

export function ContrastSelectorButton(props: Omit<ContrastSelectorProps, "variant">) {
  return <ContrastSelector {...props} variant="text" />;
}
