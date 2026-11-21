"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
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
  const readPreference = useCallback(() => readCookie(undefined, cookieName), [cookieName, readCookie]);
  const serverSnapshot = useCallback(() => fallback, [fallback]);
  const subscribe = useCallback((callback: () => void) => {
    const events = [eventName, "focus", "pageshow"];
    for (const event of events) window.addEventListener(event, callback);
    return () => { for (const event of events) window.removeEventListener(event, callback); };
  }, [eventName]);
  const value = useSyncExternalStore(subscribe, readPreference, serverSnapshot);
  const ready = useHydrated();

  useEffect(() => {
    // Also migrate legacy default names for host-only preferences after hydration.
    persistCookie(readPreference(), cookieDomain, cookieName);
    window.dispatchEvent(new Event(eventName));
  }, [cookieName, cookieDomain, eventName, readPreference, persistCookie]);

  useEffect(() => { apply(readPreference()); }, [value, readPreference, apply]);

  const select = useCallback((selection: PreferenceSelection<T>, domain = cookieDomain) => {
    const next = typeof selection === "function" ? selection(readPreference()) : selection;
    persistCookie(next, domain, cookieName);
    apply(next);
    window.dispatchEvent(new Event(eventName));
  }, [cookieName, cookieDomain, eventName, readPreference, persistCookie, apply]);

  return { value, ready, select, readPreference };
}
