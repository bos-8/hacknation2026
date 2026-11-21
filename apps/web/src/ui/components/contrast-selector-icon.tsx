import { ContrastSelector, type ContrastSelectorProps } from "./contrast-selector";

export function ContrastSelectorIcon(props: Omit<ContrastSelectorProps, "variant">) {
  return <ContrastSelector {...props} variant="icon" />;
}
