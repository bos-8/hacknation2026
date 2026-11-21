import { ThemeSelector, type ThemeSelectorProps } from "./theme-selector";

export function ThemeSelectorButton(props: Omit<ThemeSelectorProps, "variant">) {
  return <ThemeSelector {...props} variant="text" />;
}
