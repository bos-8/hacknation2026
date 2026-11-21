"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TableRefreshResult<T> = { status: "ok"; page: T } | { status: "failed" | "denied" };

/** The latest query owns the result. Superseded requests cannot overwrite it. */
export function useTableRefresh<T extends { total: number }, Q extends { page?: number; limit?: number }>(initial: T | null, query: Q, refreshAction: (query: Q) => Promise<TableRefreshResult<T>>) {
  const sequence = useRef(0);
  const [updated, setUpdated] = useState<{ source: T | null; query: Q; page: T | null; status?: TableRefreshResult<T>["status"]; loading: boolean }>();
  const current = updated?.source === initial && updated.query === query ? updated : undefined;
  const result = current ? current.page : initial;
  const pending = current?.loading ?? initial === null;
  const cancelRequests = useCallback(() => { sequence.current++; }, []);

  const read = useCallback(async (quiet: boolean) => {
    const request = ++sequence.current;
    if (!quiet) setUpdated(previous => ({ source: initial, query, loading: true,
      page: previous?.source === initial && previous.query === query ? previous.page : initial }));
    let next: TableRefreshResult<T>;
    try { next = await refreshAction(query); } catch { next = { status: "failed" }; }
    if (request !== sequence.current) return;
    if (next.status === "ok" && (query.page ?? 1) > Math.max(1, Math.ceil(next.page.total / (query.limit ?? 25)))) {
      // Replace the invalid URL; its new query triggers a read of the actual last page.
      // Never publish rows fetched using the old offset with a clamped page label.
      const url = new URL(window.location.href);
      url.searchParams.set("page", String(Math.max(1, Math.ceil(next.page.total / (query.limit ?? 25)))));
      window.history.replaceState(null, "", url);
      return;
    }
    setUpdated(previous => ({ source: initial, query, loading: false, status: next.status,
      page: next.status === "ok" ? next.page : next.status === "denied" ? null : previous?.page ?? initial }));
  }, [initial, query, refreshAction]);

  const refresh = useCallback(() => read(false), [read]);
  const refreshQuietly = useCallback(() => read(true), [read]);

  useEffect(() => {
    if (initial !== null) return;
    let cancelled = false;
    // The SSR shell already displays its loading body; start the authorized read after hydration.
    queueMicrotask(() => { if (!cancelled) void refresh(); });
    return () => { cancelled = true; cancelRequests(); };
  }, [initial, query, refresh, cancelRequests]);

  return { result, refresh, refreshQuietly, pending, status: current?.status };
}
