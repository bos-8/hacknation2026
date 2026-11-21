"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { readCookieConsent } from "@/cookies/core.js";
import { COOKIE_CONSENT_CHANGED } from "@/cookies/consent-events";
import { useHydrated } from "./use-hydrated";

export type PreferenceSelection<T extends string> = T | ((current: T) => T);
type Options<T extends string> = {
  cookieName: string;
  cookieDomain: string;
  eventName: string;
  fallback: T;
  readCookie: (read: undefined, name: string) => T;
  persistCookie: (value: T, domain: string, name: string) => void;
  apply: (value: T) => void;
};

/** Shared subscription, SSR snapshot and cookie migration; each preference owns its value policy. */
export function useCookiePreference<T extends string>({ cookieName, cookieDomain, eventName, fallback, readCookie, persistCookie, apply }: Options<T>) {
  const temporary = useRef<T>(fallback);
  const readPreference = useCallback(() => readCookieConsent() === "preferences"
    ? readCookie(undefined, cookieName) : temporary.current, [cookieName, readCookie]);
  const serverSnapshot = useCallback(() => fallback, [fallback]);
  const subscribe = useCallback((callback: () => void) => {
    const events = [eventName, COOKIE_CONSENT_CHANGED, "focus", "pageshow"];
    for (const event of events) window.addEventListener(event, callback);
    return () => { for (const event of events) window.removeEventListener(event, callback); };
  }, [eventName]);
  const value = useSyncExternalStore(subscribe, readPreference, serverSnapshot);
  const ready = useHydrated();

  useEffect(() => {
    // Also migrate legacy default names for host-only preferences after hydration.
    if (readCookieConsent() === "preferences") persistCookie(readPreference(), cookieDomain, cookieName);
    window.dispatchEvent(new Event(eventName));
  }, [cookieName, cookieDomain, eventName, readPreference, persistCookie]);

  useEffect(() => { apply(readPreference()); }, [value, readPreference, apply]);

  const select = useCallback((selection: PreferenceSelection<T>, domain = cookieDomain) => {
    const next = typeof selection === "function" ? selection(readPreference()) : selection;
    if (readCookieConsent() === "preferences") persistCookie(next, domain, cookieName);
    else temporary.current = next;
    apply(next);
    window.dispatchEvent(new Event(eventName));
  }, [cookieName, cookieDomain, eventName, readPreference, persistCookie, apply]);

  return { value, ready, select, readPreference };
}
