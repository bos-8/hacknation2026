"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { THEME_COOKIE_KEY, applyTheme, persistTheme, readThemeCookie } from "@/cookies";
import type { AppTheme } from "@/schemas/theme";
import { useCookiePreference, type PreferenceSelection } from "./use-cookie-preference";

const THEME_CHANGED = "formiq:theme-changed";
type ThemeSelection = PreferenceSelection<AppTheme>;
const ThemeContext = createContext<{
  theme: AppTheme;
  ready: boolean;
  selectTheme: (theme: ThemeSelection, cookieDomain?: string) => void;
} | null>(null);

export function ThemeProvider({ cookieDomain = "", cookieName = THEME_COOKIE_KEY, children }: { cookieDomain?: string; cookieName?: string; children: ReactNode }) {
  const { value: theme, ready, select: selectTheme, readPreference } = useCookiePreference<AppTheme>({
    cookieName, cookieDomain, eventName: THEME_CHANGED, fallback: "system",
    readCookie: readThemeCookie, persistCookie: persistTheme, apply: applyTheme,
  });

  useEffect(() => {
    // Read the current preference so an older queued effect cannot undo a newer click.
    const update = () => applyTheme(readPreference());
    update();
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [readPreference]);

  return <ThemeContext.Provider value={{ theme, ready, selectTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("Theme selectors must be rendered inside ThemeProvider");
  return context;
}
