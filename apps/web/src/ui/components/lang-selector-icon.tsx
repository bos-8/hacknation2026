import { LangSelector, type LangSelectorProps } from "./lang-selector";

export function LangSelectorIcon(props: Omit<LangSelectorProps, "variant">) {
  return <LangSelector {...props} variant="icon" />;
}
