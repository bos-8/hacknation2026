"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { COOKIE_CONSENT_CHANGED, OPEN_COOKIE_SETTINGS } from "@/cookies/consent-events";
import { clearRememberedPreferences, persistCookieConsent, readCookieConsent } from "@/cookies/core.js";
import { Button } from "@/ui/basic";
import { Popup } from "./popup";

type Choice = NonNullable<ReturnType<typeof readCookieConsent>>;

const readDecision = () => readCookieConsent();
const serverDecision = () => "loading" as const;
function subscribe(callback: () => void) {
  const events = [COOKIE_CONSENT_CHANGED, "focus", "pageshow"];
  for (const event of events) window.addEventListener(event, callback);
  return () => { for (const event of events) window.removeEventListener(event, callback); };
}

export function CookieSettingsButton({ className }: { className?: string }) {
  const t = useTranslations("common.cookies");
  return <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS))}>
    {t("openSettings")}
  </button>;
}

export function CookieConsent({ cookieNames, cookieDomain }: { cookieNames: string[]; cookieDomain: string }) {
  const t = useTranslations("common.cookies");
  const choice = useSyncExternalStore<Choice | null | "loading">(subscribe, readDecision, serverDecision);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    function openSettings() {
      setRemember(readCookieConsent() === "preferences");
      setDetails(true);
      setSettingsOpen(true);
    }
    window.addEventListener(OPEN_COOKIE_SETTINGS, openSettings);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS, openSettings);
  }, []);

  function close() {
    setSettingsOpen(false);
    setDismissed(true);
    setDetails(false);
  }

  function save(next: Choice) {
    persistCookieConsent(next, cookieDomain);
    if (next === "essential") clearRememberedPreferences([...cookieNames, "theme"], cookieDomain);
    window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED));
    close();
  }

  if (choice === "loading" || !(settingsOpen || (choice === null && !dismissed))) return null;

  return <Popup size="compact" title={t(details ? "settingsTitle" : "title")} onClose={close} closeOnBackdropClick={false} content={
    <div className="flex min-h-full flex-col gap-4 text-base">
      <p className="text-center">{t("description")}</p>
      {details && <>
        <section className="rounded-xl border border-panel-border p-4" aria-label={t("essential")}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <h3 className="font-semibold text-foreground">{t("essential")}</h3>
            <span className="text-[0.85rem]">{t("alwaysActive")}</span>
          </div>
          <p className="mt-1 text-center">{t("essentialDescription")}</p>
        </section>
        <section className="rounded-xl border border-panel-border p-4" aria-label={t("preferences")}>
          <label className="flex items-center gap-2 font-semibold text-foreground">
            <input type="checkbox" className="size-4 accent-accent" checked={remember}
              aria-describedby="cookie-preferences-description" onChange={event => setRemember(event.target.checked)} />
            {t("preferences")}
          </label>
          <p id="cookie-preferences-description" className="mt-1 text-center">{t("preferencesDescription")}</p>
        </section>
      </>}
      <div className="mt-auto grid gap-2 pt-5 [&_button]:min-h-11 [&_button]:text-base">
        <Button tone="main-outline" onClick={() => save("essential")}>{t("reject")}</Button>
        <Button tone="main-outline" onClick={() => save("preferences")}>{t("accept")}</Button>
        {details
          ? <Button tone="main-outline" onClick={() => save(remember ? "preferences" : "essential")}>{t("save")}</Button>
          : <Button tone="main-outline" onClick={() => setDetails(true)}>{t("customize")}</Button>}
      </div>
    </div>
  } />;
}
