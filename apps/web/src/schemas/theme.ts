export const THEME_OPTIONS = ["system", "dark", "light"] as const;
export type AppTheme = (typeof THEME_OPTIONS)[number];

export function isAppTheme(value: unknown): value is AppTheme {
  return typeof value === "string" && (THEME_OPTIONS as readonly string[]).includes(value);
}

export function getNextTheme(theme: AppTheme): AppTheme {
  if (!isAppTheme(theme)) throw new Error("Invalid theme preference");
  return THEME_OPTIONS[(THEME_OPTIONS.indexOf(theme) + 1) % THEME_OPTIONS.length];
}
