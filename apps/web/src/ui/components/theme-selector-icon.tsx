import { ThemeSelector, type ThemeSelectorProps } from "./theme-selector";

export function ThemeSelectorIcon(props: Omit<ThemeSelectorProps, "variant">) {
  return <ThemeSelector {...props} variant="icon" />;
}
