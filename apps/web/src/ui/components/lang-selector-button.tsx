import { LangSelector, type LangSelectorProps } from "./lang-selector";

export function LangSelectorButton(props: Omit<LangSelectorProps, "variant">) {
  return <LangSelector {...props} variant="text" />;
}
