"use client";

import { useMemo, type ReactNode, type MouseEvent, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { getPathname } from "@/i18n/navigation";
import type { AppLocale } from "@/schemas/i18n";

export function useTableQuery<Q>(initial: Q, parse: (params: Record<string, string | string[] | undefined>) => Q): Q {
  const searchParams = useSearchParams();
  const search = searchParams?.toString();
  return useMemo(() => {
    if (search === undefined) return initial;
    const params = new URLSearchParams(search);
    const values: Record<string, string | string[] | undefined> = {};
    for (const key of params.keys()) {
      const entries = params.getAll(key);
      values[key] = entries.length > 1 ? entries : entries[0];
    }
    return parse(values);
  }, [initial, parse, search]);
}

/** Keep table queries in browser history without navigating the surrounding page. */
export function TableQuery({ locale, pathname, children, pending }: {
  locale: AppLocale; pathname: "/forms" | "/admin/users" | "/admin/files" | "/admin/files/ocr" | "/admin/products" | "/admin/tags" | "/admin/queue" | "/admin/settings"; children: ReactNode; pending: boolean;
}) {
  const path = getPathname({ locale, href: pathname });
  function click(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest("a");
    if (!anchor || anchor.target || anchor.hasAttribute("download") || anchor.hasAttribute("data-navigate")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== path) return;
    event.preventDefault();
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
  }
  function submit(event: FormEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLFormElement) || !event.target.hasAttribute("data-table-query")) return;
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const form = new FormData(event.target, submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : undefined);
    const url = new URL(path, window.location.origin);
    for (const [name, value] of form) if (typeof value === "string" && value !== "") url.searchParams.append(name, value);
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
  }
  return <div aria-busy={pending} className="space-y-1" onClickCapture={click} onSubmitCapture={submit}>{children}</div>;
}
