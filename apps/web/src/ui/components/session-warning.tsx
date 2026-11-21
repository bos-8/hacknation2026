"use client";

import { useTranslations } from "next-intl";
import { Button, Throbber } from "@/ui/basic";
import { Popup } from "./popup";
import type { SessionLifecycle } from "./use-session-lifecycle";
import { sessionWarningStyles } from "./styles";

export function SessionWarning({ session }: { session: SessionLifecycle }) {
  const t = useTranslations("common.session");
  const busy = session.pending || session.logoutPending;
  if (!session.popupOpen && !session.logoutPending) return null;
  return <Popup title={t(session.expired ? "expired" : "warning")} disableClose={busy} onClose={session.dismiss}
    actionsClassName={sessionWarningStyles.actions}
    content={<div className="space-y-3">
      <p>{session.expired ? t("expiredMessage") : t("warningMessage", { time: session.time })}</p>
      {!session.expired && session.status.refreshes >= session.status.maxRefreshes && <p>{t("limit")}</p>}
      {session.unavailable && <p role="alert" className="text-danger">{t("unavailable")}</p>}
      {session.logoutError && <p role="alert" className="text-danger">{t("logoutError")}</p>}
    </div>}
    actions={<>
      <Button size="sm" tone={sessionWarningStyles.tones.logout} disabled={busy} aria-busy={session.logoutPending} onClick={() => void session.hardSignOut()}>
        {session.logoutPending ? <Throbber size="sm" label={t("loggingOut")} /> : t("logoutNow")}
      </Button>
      <Button size="sm" tone={sessionWarningStyles.tones.acknowledge} disabled={busy} onClick={session.dismiss}>{t("acknowledge")}</Button>
      <Button size="sm" tone={sessionWarningStyles.tones.renew} disabled={!session.canRenew || busy} aria-busy={session.pending} onClick={() => void session.renew()}>
        {session.pending ? <Throbber size="sm" label={t("renewing")} /> : t("renew")}
      </Button>
    </>} />;
}
