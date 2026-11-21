"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BoxArrowInRight } from "react-bootstrap-icons";
import { signIn } from "@/server/auth/actions";
import { Button } from "@/ui/basic/button";
import { Throbber } from "@/ui/basic/throbber";
import type { AppLocale } from "@/schemas/i18n";
import type { AuthActionState } from "@/schemas/auth";
import { Popup } from "./popup";
import { useHydrated } from "./use-hydrated";

type AuthControlProps = {
  locale: AppLocale;
  labels: { signIn: string; signOut: string; pending: string; unavailable: string; error: string; close: string };
};

/** Client code handles the modal and pending UI; authentication stays in Server Actions. */
export function AuthControl({ locale, labels }: AuthControlProps) {
  const hydrated = useHydrated();
  const trigger = useRef<HTMLButtonElement>(null);
  const callbackFailure = useSearchParams().get("auth") === "unavailable";
  const [state, action, pending] = useActionState(signIn, { unavailable: false });
  const [callbackOpen, setCallbackOpen] = useState(callbackFailure);
  const [dismissed, setDismissed] = useState<AuthActionState | null>(null);
  // Dismissing one result must not hide a later failed sign-in attempt.
  const open = callbackOpen || (state.unavailable && state !== dismissed);

  useEffect(() => {
    if (callbackFailure) {
      const url = new URL(window.location.href);
      for (const key of ["auth", "error", "error_description"]) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", url);
    }
  }, [callbackFailure]);

  const close = () => { setDismissed(state); setCallbackOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };

  return <>
    <form action={action} className="flex shrink-0 items-center gap-2">
      <input type="hidden" name="locale" value={locale} />
      <Button ref={trigger} type="submit" tone="success-outline" size="sm" disabled={pending || !hydrated} aria-busy={pending || !hydrated} className="w-[150px] whitespace-nowrap">
        {pending ? <Throbber size="sm" label={labels.pending} /> : <><BoxArrowInRight aria-hidden="true" className="size-4 shrink-0" />{labels.signIn}</>}
      </Button>
    </form>
    {open && <Popup title={labels.unavailable} content={<p>{labels.error}</p>} onClose={close}
      actions={<Button onClick={close} autoFocus>{labels.close}</Button>} />}
  </>;
}
