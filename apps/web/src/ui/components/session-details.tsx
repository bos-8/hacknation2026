"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, Separator, Throbber } from "@/ui/basic";
import type { SessionLifecycle } from "./use-session-lifecycle";

export function SessionDetails({ session }: { session: SessionLifecycle }) {
  const t = useTranslations("common.session");
  return <>
    <Separator className="my-3" />
    <div className="space-y-2 text-xs">
      <p className="text-muted-foreground">{t("roles")}</p>
      <div className="flex flex-wrap gap-1" data-session-roles>
        {session.roles === null ? <span>{t("rolesUnavailable")}</span> : session.roles.length
          ? session.roles.map(role => <Badge key={role}>{role}</Badge>) : <span>{t("noRoles")}</span>}
      </div>
      <Separator className="my-3" />
      <div className="flex flex-wrap justify-between gap-2">
        <span>{session.expired ? t("expired") : t("remaining")}</span>
        <time data-session-countdown dateTime={session.status.expiresAt} className="font-semibold tabular-nums">{session.time}</time>
      </div>
      <Separator className="my-3" />
      <div className="flex justify-between gap-2 text-muted-foreground"><span>{t("renewals")}</span><span>{session.status.refreshes}/{session.status.maxRefreshes}</span></div>
      {session.unavailable && <p role="status" className="text-danger">{t("unavailable")}</p>}
      {session.warning && <>
        <Separator className="my-3" />
        <Button size="sm" className="w-full" tone="success-outline" disabled={!session.canRenew || session.pending} onClick={() => void session.renew()}>
          {session.pending ? <Throbber size="sm" label={t("renewing")} /> : t("renew")}
        </Button>
        {session.status.refreshes >= session.status.maxRefreshes && <p>{t("limit")}</p>}
      </>}
    </div>
  </>;
}
