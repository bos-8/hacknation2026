"use client";

import { createContext, useContext, type ReactNode } from "react";
import { CONTRAST_COOKIE_KEY, applyContrast, persistContrast, readContrastCookie } from "@/cookies";
import type { AppContrast } from "@/schemas/contrast";
import { useCookiePreference, type PreferenceSelection } from "./use-cookie-preference";

const CONTRAST_CHANGED = "formiq:contrast-changed";
type ContrastSelection = PreferenceSelection<AppContrast>;
const ContrastContext = createContext<{
  contrast: AppContrast;
  ready: boolean;
  selectContrast: (contrast: ContrastSelection) => void;
} | null>(null);

export function ContrastProvider({ cookieDomain = "", cookieName = CONTRAST_COOKIE_KEY, children }: { cookieDomain?: string; cookieName?: string; children: ReactNode }) {
  const { value: contrast, ready, select: selectContrast } = useCookiePreference<AppContrast>({
    cookieName, cookieDomain, eventName: CONTRAST_CHANGED, fallback: "normal",
    readCookie: readContrastCookie, persistCookie: persistContrast, apply: applyContrast,
  });

  return <ContrastContext.Provider value={{ contrast, ready, selectContrast }}>{children}</ContrastContext.Provider>;
}

export function useContrast() {
  const context = useContext(ContrastContext);
  if (!context) throw new Error("Contrast selectors must be rendered inside ContrastProvider");
  return context;
}
