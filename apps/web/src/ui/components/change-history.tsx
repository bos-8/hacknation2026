"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { z } from "zod";
import { Button, Throbber } from "@/ui/basic";
import { AsideSection } from "./aside-section";

const rowSchema = z.object({ uuid: z.uuid(), actorUuid: z.uuid().nullable(), occurredAt: z.iso.datetime(),
  operation: z.enum(["INSERT", "UPDATE", "DELETE"]),
  before: z.record(z.string(), z.unknown()).nullable(), after: z.record(z.string(), z.unknown()).nullable() });
const pageSchema = z.object({ rows: z.array(rowSchema).max(100), next: z.uuid().nullable() });
type Entity = "product" | "file" | "file_version";

export function ChangeHistory({ entity, uuid }: { entity: Entity; uuid: string }) {
  const t = useTranslations("common.admin.history");
  return <AsideSection title={t("title")}><HistoryEntries key={`${entity}:${uuid}`} entity={entity} uuid={uuid} /></AsideSection>;
}

function HistoryEntries({ entity, uuid }: { entity: Entity; uuid: string }) {
  const t = useTranslations("common.admin.history");
  const format = useFormatter();
  const [rows, setRows] = useState<z.infer<typeof rowSchema>[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let active = true;
    async function load() {
      try {
        const query = new URLSearchParams({ entity, uuid, ...(before ? { before } : {}) });
        const response = await fetch(`/api/v1/admin/history?${query}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("History unavailable");
        const page = pageSchema.parse(await response.json());
        if (!active) return;
        setRows(previous => before ? [...previous, ...page.rows] : page.rows); setNext(page.next); setFailed(false);
      } catch { if (active) setFailed(true); }
      finally { clearTimeout(timeout); if (active) setPending(false); }
    }
    void load();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [entity, uuid, before, attempt]);
  const value = (item: unknown) => item === undefined || item === null ? "—" : typeof item === "string" ? item : JSON.stringify(item);
  return <div className="space-y-4">
    {rows.map(row => {
      const fields = [...new Set([...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})])]
        .filter(key => !["updated_at", "updated_by"].includes(key) && JSON.stringify(row.before?.[key]) !== JSON.stringify(row.after?.[key]));
      return <section key={row.uuid} className="space-y-2 border-b border-border pb-3">
        <p className="text-sm font-medium">{t(`operations.${row.operation}`)} · {format.dateTime(new Date(row.occurredAt), { dateStyle: "medium", timeStyle: "short" })}</p>
        <p className="text-xs text-muted-foreground wrap-anywhere">{t("actor")}: {row.actorUuid ?? t("unknownActor")}</p>
        <details><summary className="cursor-pointer text-sm">{t("changes")}</summary>
          <dl className="mt-2 space-y-3">{fields.map(field => <div key={field}>
            <dt className="text-xs font-medium">{t.has(`fields.${field}`) ? t(`fields.${field}`) : field}</dt>
            <dd className="grid gap-2 text-xs sm:grid-cols-2">
              <div><span className="text-muted-foreground">{t("before")}</span><pre className="max-h-48 overflow-auto whitespace-pre-wrap wrap-anywhere">{value(row.before?.[field])}</pre></div>
              <div><span className="text-muted-foreground">{t("after")}</span><pre className="max-h-48 overflow-auto whitespace-pre-wrap wrap-anywhere">{value(row.after?.[field])}</pre></div>
            </dd>
          </div>)}</dl>
        </details>
      </section>;
    })}
    {pending && <Throbber label={t("loading")} />}
    {failed && <div className="space-y-2"><p role="alert">{t("failed")}</p><Button size="sm" disabled={pending} onClick={() => { setPending(true); setAttempt(value => value + 1); }}>{t("retry")}</Button></div>}
    {!pending && !failed && rows.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
    {!failed && next && <Button size="sm" disabled={pending} onClick={() => { setPending(true); setBefore(next); }}>{t("more")}</Button>}
  </div>;
}
