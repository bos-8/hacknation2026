"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Clipboard } from "react-bootstrap-icons";
import { IconButton } from "@/ui/basic";

const credentials = [
  { field: "username", value: "admin", action: "copyUsername" },
  { field: "password", value: "admin", action: "copyPassword" },
] as const;

export function PocCredentials() {
  const t = useTranslations("home");
  const [message, setMessage] = useState("");

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(t("copied"));
    } catch {
      setMessage(t("copyFailed"));
    }
  }

  return <>
    <dl className="mt-2 grid w-fit gap-1 text-sm">
      {credentials.map(({ field, value, action }) => (
        <div key={field} className="grid grid-cols-[6rem_auto] items-center gap-2">
          <dt>{t(field)}</dt>
          <dd className="flex items-center gap-2">
            <code>{value}</code>
            <IconButton label={t(action)} title={t(action)} onClick={() => copy(value)}>
              <Clipboard />
            </IconButton>
          </dd>
        </div>
      ))}
    </dl>
    <p role="status" className="text-sm">{message}</p>
  </>;
}
