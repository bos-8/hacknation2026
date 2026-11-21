"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ADMIN_ROLES, sessionStatusSchema, type SessionStatus } from "@/schemas/session";
import { useLocale } from "next-intl";
import { API_ROUTES } from "@/config/api-routes";

export function formatSessionTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Polling is read-only. Only explicit POSTs can renew the server-owned expiry. */
export function useSessionLifecycle(initial: SessionStatus, preview = false, initiallyInvalid = false) {
  const [status, setStatus] = useState(initial);
  const [clock, setClock] = useState<{ now: number; skew: number | null }>(() => ({ now: Date.parse(initial.serverTime), skew: null }));
  const [invalid, setInvalid] = useState(initiallyInvalid);
  const [unavailable, setUnavailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [automaticLogout, setAutomaticLogout] = useState(false);
  const progressReady = useRef<(() => void) | null>(null);
  const logoutProgressReady = useCallback(() => { progressReady.current?.(); }, []);
  const redirecting = useRef(false);
  const locale = useLocale();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const active = useRef(true);
  const running = useRef<Promise<boolean> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const router = useRouter();
  const roleSignature = status.roles === null ? "unavailable" : [...status.roles].sort().join(",");
  const previousRoles = useRef(roleSignature);

  useEffect(() => {
    if (preview) return;
    const isAdminRoute = /^\/(?:pl|en)\/admin(?:\/|$)/.test(pathname);
    if (isAdminRoute && (unavailable || !ADMIN_ROLES.some(role => status.roles?.includes(role)))) {
      // Drop the protected document and cached UI without ending the valid user session.
      window.location.replace(`/${locale}/access-denied`);
      return;
    }
    if (previousRoles.current !== roleSignature) {
      previousRoles.current = roleSignature;
      router.refresh(); // Reconcile server-rendered navigation after a grant or revocation.
    }
  }, [preview, pathname, unavailable, status.roles, roleSignature, locale, router]);

  const request = useCallback(async (reason?: "manual" | "navigation", path?: string): Promise<boolean> => {
    if (preview) return false;
    if (running.current) { if (!reason) return false; await running.current; }
    const task = (async () => {
      const abort = new AbortController();
      controller.current = abort;
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; abort.abort(); }, 10000);
      try {
        const response = await fetch(reason ? API_ROUTES.session.renew : API_ROUTES.session.status, {
          credentials: "same-origin", cache: "no-store", signal: abort.signal,
          ...(reason ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, pathname: path }) } : {}),
        });
        if (!active.current || controller.current !== abort || abort.signal.aborted) return false;
        if (response.status === 401) { setInvalid(true); return false; }
        if (response.status === 403 && reason) { setUnavailable(false); return false; }
        if (!response.ok) { setUnavailable(true); return false; }
        const data = sessionStatusSchema.parse(await response.json());
        if (!active.current || controller.current !== abort || abort.signal.aborted) return false;
        if (data.sessionUuid !== initial.sessionUuid || data.userUuid !== initial.userUuid) {
          // Another tab may have switched accounts. Never mix that user's roles with this profile.
          setUnavailable(true); router.refresh(); return false;
        }
        const skew = Date.parse(data.serverTime) - Date.now();
        setStatus(data); setClock({ now: Date.now() + skew, skew }); setInvalid(false); setUnavailable(false);
        return true;
      } catch {
        if (active.current && controller.current === abort && (!abort.signal.aborted || timedOut)) setUnavailable(true);
        return false;
      }
      finally { clearTimeout(timeout); }
    })();
    running.current = task;
    try { return await task; } finally { if (running.current === task) running.current = null; }
  }, [preview, initial.sessionUuid, initial.userUuid, router]);

  useEffect(() => {
    active.current = true;
    void request();
    const poll = setInterval(() => { if (document.visibilityState === "visible") void request(); }, 10000);
    const focus = () => { if (document.visibilityState === "visible") void request(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    return () => { active.current = false; clearInterval(poll); controller.current?.abort(); controller.current = null; running.current = null; window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [request]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setClock(value => value.skew === null
      ? { now: Date.parse(initial.serverTime), skew: Date.parse(initial.serverTime) - Date.now() } : value));
    const tick = setInterval(() => setClock(value => value.skew === null ? value : { ...value, now: Date.now() + value.skew }), 1000);
    return () => { cancelAnimationFrame(frame); clearInterval(tick); };
  }, [initial.serverTime]);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (status.autoRefresh && /^\/(?:pl|en)\/[^?#]+$/.test(pathname)) void request("navigation", pathname);
    else void request();
  }, [pathname, status.autoRefresh, request]);

  const remaining = invalid ? 0 : Math.max(0, Math.ceil((Date.parse(status.expiresAt) - clock.now) / 1000));
  const expired = remaining === 0;
  const warning = !expired && remaining < status.warningSeconds;
  const canRenew = warning && !preview && status.refreshes < status.maxRefreshes;
  const popupKey = `${status.expiresAt}:${expired ? "expired" : "warning"}`;
  const hardSignOut = useCallback(async (reason: "manual" | "expired" | "invalid" = "manual") => {
    if (preview || redirecting.current) return;
    redirecting.current = true;
    const painted = reason === "manual" ? null : new Promise<void>(resolve => {
      // Background tabs may not paint; they must still complete logout.
      const timeout = setTimeout(resolve, 1000);
      progressReady.current = () => { clearTimeout(timeout); resolve(); };
    });
    setAutomaticLogout(reason !== "manual");
    setLogoutPending(true); setLogoutError(false);
    try {
      if (painted) await painted;
      progressReady.current = null;
      const response = await fetch(API_ROUTES.session.logout, {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale, sessionUuid: initial.sessionUuid, reason,
          expectedExpiresAt: status.expiresAt, expectedRenewalCount: status.refreshes }),
      });
      if (!response.ok) throw new Error("Logout unavailable");
      const result = await response.json() as { success?: boolean; renewed?: boolean; url?: string };
      if (!result.success) throw new Error("Logout unavailable");
      if (result.renewed) {
        // A lost renewal cookie may make resynchronization impossible. Leave the
        // protected UI without looping or revoking another tab's valid lease.
        if (!await request()) { window.location.replace(`/${locale}`); return; }
        redirecting.current = false; setLogoutPending(false); setAutomaticLogout(false); return;
      }
      const destination = result.url ?? `/${locale}`;
      // Full navigation clears protected React/Next state, just as in TrueGuard.
      if (reason === "manual") window.location.assign(destination);
      else window.location.replace(destination);
    } catch {
      if (reason !== "manual") { window.location.replace(`/${locale}`); return; }
      redirecting.current = false; setLogoutPending(false); setLogoutError(true);
    }
  }, [preview, locale, initial.sessionUuid, request, status.expiresAt, status.refreshes]);

  useEffect(() => {
    if (!expired || preview || pending || logoutPending) return;
    const timer = setTimeout(() => { void hardSignOut(invalid ? "invalid" : "expired"); }, 0);
    return () => clearTimeout(timer);
  }, [expired, preview, pending, logoutPending, invalid, hardSignOut]);
  async function renew() {
    if (!canRenew || pending) return;
    setPending(true);
    try { if (!await request("manual")) await request(); } finally { if (active.current) setPending(false); }
  }
  function dismiss() { setDismissed(popupKey); if (expired && !preview) router.refresh(); }
  return { status, remaining, time: formatSessionTime(remaining), expired, warning, canRenew, pending, unavailable,
    hardSignOut, logoutPending, logoutError, clearLogoutError: () => setLogoutError(false), automaticLogout, logoutProgressReady,
    popupOpen: (warning || (expired && preview)) && dismissed !== popupKey, renew, dismiss,
    roles: unavailable ? null : status.roles };
}

export type SessionLifecycle = ReturnType<typeof useSessionLifecycle>;
