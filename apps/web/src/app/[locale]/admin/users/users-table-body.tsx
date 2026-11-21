"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckLg, InfoCircle, InfoCircleFill, XLg } from "react-bootstrap-icons";
import type { AdminUser } from "@/schemas/admin-users";
import { Badge, Button, Checkbox, TableBody, TableCell, TableRow, Throbber } from "@/ui/basic";
import { PushAside } from "@/ui/components/aside";
import { Blur } from "@/ui/components/blur";
import { TableLoadingBody } from "@/ui/components/table-loading-body";
import { tableStyles } from "@/ui/components/styles";

export function UsersTableBody({ users, emptyMessage, loading = false }: { users: AdminUser[]; emptyMessage: string; loading?: boolean }) {
  const t = useTranslations("common.admin.users");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [displayedId, setDisplayedId] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeUser = users.find(user => user.id === activeId);
  const displayedUser = users.find(user => user.id === displayedId);
  const switching = Boolean(activeUser && activeId !== displayedId);
  const fullName = (user: AdminUser) => [user.firstName, user.lastName].filter(Boolean).join(" ") || "—";

  useEffect(() => () => clearTimeout(timer.current), []);

  function close() {
    clearTimeout(timer.current);
    setActiveId(null);
  }

  function toggleDetails(id: string, button: HTMLButtonElement) {
    if (id === activeId) {
      close();
      return;
    }
    clearTimeout(timer.current);
    trigger.current = button;
    setActiveId(id);
    if (activeUser && displayedUser && id !== displayedId) {
      timer.current = setTimeout(() => setDisplayedId(id), 180);
    } else {
      setDisplayedId(id);
    }
  }

  return <>
    {loading && <TableLoadingBody colSpan={7} label={t("loadingData")} />}
    <TableBody hidden={loading} inert={loading} className={tableStyles.dataBody}>
      {users.map(user => {
        const active = user.id === activeId;
        const Icon = active ? InfoCircleFill : InfoCircle;
        const label = t("detailsFor", { username: user.username });
        const verified = Boolean(user.email && user.emailVerified);
        const VerificationIcon = verified ? CheckLg : XLg;
        const verificationLabel = t(!user.email ? "noEmail" : verified ? "emailConfirmed" : "emailUnconfirmed");
        return <TableRow key={user.id} data-details-active={active ? "true" : undefined}
          className={active ? "bg-accent/10 hover:bg-accent/15" : undefined}>
          <TableCell><Checkbox name="selectedUser" value={user.id} aria-label={t("selectUser", { username: user.username })} /></TableCell>
          <TableCell className="max-w-xs break-words font-medium">{user.username}</TableCell>
          <TableCell className="max-w-xs break-words">{fullName(user)}</TableCell>
          <TableCell className="max-w-xs break-words">{user.email || "—"}</TableCell>
          <TableCell><Badge tone={user.enabled ? "success" : "neutral"} className="whitespace-nowrap">{t(user.enabled ? "enabled" : "disabled")}</Badge></TableCell>
          <TableCell>
            <VerificationIcon role="img" aria-label={verificationLabel} className={verified ? "size-4 text-success" : "size-4 text-error"} />
          </TableCell>
          <TableCell actionColumn>
            <Button size="icon" tone={active ? "primary" : "ghost"} aria-label={label} aria-expanded={active}
              tooltip={t("additionalInfo")} tooltipPlacement="bottom"
              className={active ? "size-7 p-0" : "size-7 border-primary p-0 text-primary hover:bg-primary/10 active:bg-primary/20"}
              onClick={event => toggleDetails(user.id, event.currentTarget)}>
              <Icon aria-hidden="true" className="size-3.5" />
            </Button>
          </TableCell>
        </TableRow>;
      })}
      {users.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{emptyMessage}</TableCell></TableRow>}
    </TableBody>
    {displayedUser && <PushAside open={Boolean(activeUser)} onClose={close} title={t("details")} triggerRef={trigger}
      aria-busy={switching} bodyClassName="relative">
      <dl inert={switching} aria-hidden={switching || undefined} className="space-y-3">
        {[
          { label: "ID", value: displayedUser.id },
          { label: t("username"), value: displayedUser.username },
          { label: t("name"), value: fullName(displayedUser) },
          { label: t("email"), value: displayedUser.email || "—" },
          { label: t("status"), value: t(displayedUser.enabled ? "enabled" : "disabled") },
          { label: t("emailVerified"), value: t(!displayedUser.email ? "noEmail" : displayedUser.emailVerified ? "yes" : "no") },
        ].map(field => <div key={field.label}>
          <dt className="text-xs text-muted-foreground">{field.label}</dt>
          <dd className="wrap-anywhere">{field.value}</dd>
        </div>)}
      </dl>
      {switching && <div className="absolute inset-0 grid place-items-center">
        <Blur className="bg-panel/65" />
        <Throbber label={t("loadingDetails")} className="relative text-panel-foreground" />
      </div>}
    </PushAside>}
  </>;
}
