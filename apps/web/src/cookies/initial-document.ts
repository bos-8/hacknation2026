import { legacyPreferenceCookieName, readBrowserCookie } from "./core.js";

/** Apply explicit choices before the first paint, even when the app bundle is still loading. */
export function initialDocumentPreferences(themeCookieName: string, contrastCookieName: string) {
  const names = [themeCookieName, legacyPreferenceCookieName(themeCookieName),
    contrastCookieName, legacyPreferenceCookieName(contrastCookieName)];
  const serializedNames = JSON.stringify(names).replaceAll("<", "\\u003c");

  return `(() => {
    const read = ${readBrowserCookie.toString()};
    const [themeName, legacyTheme, contrastName, legacyContrast] = ${serializedNames};
    const theme = read(themeName) ?? (legacyTheme ? read(legacyTheme) : undefined);
    const contrast = read(contrastName) ?? (legacyContrast ? read(legacyContrast) : undefined);
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") root.dataset.theme = theme;
    if (contrast === "normal" || contrast === "high") root.dataset.contrast = contrast;
  })();`;
}
