"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Throbber } from "@/ui/basic";
import { Popup } from "./popup";
import { sessionLogoutStyles } from "./styles";

const ignoreClose = () => {};

/** Blocks interaction until logout navigation; readiness follows a painted modal frame. */
export function SessionLogoutProgress({ onReady }: { onReady: () => void }) {
  const t = useTranslations("common.session");
  useEffect(() => {
    let painted: number | undefined;
    const frame = requestAnimationFrame(() => { painted = requestAnimationFrame(onReady); });
    return () => { cancelAnimationFrame(frame); if (painted !== undefined) cancelAnimationFrame(painted); };
  }, [onReady]);

  return <Popup ariaLabel={t("loggingOut")} disableClose showCloseButton={false}
    closeOnEscape={false} closeOnBackdropClick={false} onClose={ignoreClose}>
    <div className={sessionLogoutStyles.content} aria-busy="true" data-session-logout-progress>
      <Throbber size="lg" label={t("loggingOut")} className={sessionLogoutStyles.status} />
    </div>
  </Popup>;
}
