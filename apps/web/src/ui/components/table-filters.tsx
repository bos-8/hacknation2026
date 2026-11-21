"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Funnel, FunnelFill, Plus, X } from "react-bootstrap-icons";
import { Button, Checkbox, Select, VerticalDivider } from "@/ui/basic";
import { CornerBadge } from "./corner-badge";
import { tableStyles } from "./styles";

const compactControl = "h-7 min-h-7 px-2 py-0 text-xs";
type FilterRow = { key: string; value: string };
type FilterDefinition = { key: string; label: string; multiple?: boolean; options: { value: string; label: string }[] };

export function TableToolbarPanel({ id, open, onClose, children }: {
  id: string; open: boolean; onClose: () => void; children: ReactNode;
}) {
  return <div id={id} inert={!open} aria-hidden={!open}
    className={`grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-in-out motion-reduce:transition-none ${open ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0"}`}
    onKeyDown={event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }}>
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>;
}

export function TableFilters({ action, namespace, definitions, values, preserved, search, actions, refreshButton, extraPanel }: {
  action: string;
  namespace: string;
  definitions: FilterDefinition[];
  values: Record<string, string>;
  preserved: Record<string, string>;
  search: ReactNode;
  actions?: ReactNode;
  refreshButton: ReactNode;
  extraPanel?: ReactNode;
}) {
  const t = useTranslations(namespace);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const applied = definitions.flatMap(({ key }) => values[key] ? [{ key, value: values[key] }] : []);
  const [rows, setRows] = useState<FilterRow[]>([]);
  const available = definitions.find(({ key }) => rows.every(row => row.key !== key));
  const Icon = applied.length ? FunnelFill : Funnel;
  const definition = (key: string) => definitions.find(item => item.key === key);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function toggle() {
    if (open) {
      close();
      return;
    }
    setRows(applied.length || !definitions[0] ? applied : [{ key: definitions[0].key, value: "" }]);
    setOpen(true);
  }

  return <div className="rounded-lg border border-border bg-card shadow-sm">
    <div role="group" aria-label={t("actions")} className={tableStyles.toolbar}>
      {search}
      <div className="flex shrink-0 items-center gap-2">
        {actions && <>{actions}<VerticalDivider /></>}
        <Button ref={trigger} data-table-filter size="icon" tone={open ? "primary" : "main"} className="relative size-7 p-0"
          aria-label={t("filters")} aria-controls={id} aria-expanded={open}
          tooltip={t("filters")} tooltipPlacement="bottom" onClick={toggle}>
          <Icon aria-hidden="true" className="size-3.5" />
          {applied.length > 0 && <CornerBadge aria-hidden="true" value={applied.length} color="blue" className="-right-px -top-px" />}
        </Button>
        {refreshButton && <><VerticalDivider />{refreshButton}</>}
      </div>
    </div>
    {extraPanel}
    <TableToolbarPanel id={id} open={open} onClose={close}>
        <form data-table-query action={action} method="get" onSubmit={close} aria-label={t("filters")} className="border-t border-border bg-muted/20 px-3 py-2">
          {Object.entries(preserved).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("tableFilters")}</span>
            <Button size="icon" tone="danger-outline" className="size-7 p-0" aria-label={t("closeFilters")}
              tooltip={t("closeFilters")} tooltipPlacement="bottom" onClick={close}><X aria-hidden="true" className="size-3.5" /></Button>
          </div>
          <div className="grid gap-1.5">
            {rows.map(row => <div key={row.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-1.5">
              <label className="grid min-w-0 gap-0.5 text-xs font-medium text-muted-foreground">
                {t("filterColumn")}
                <Select value={row.key} className={compactControl} onChange={event => {
                  const next = definition(event.target.value)?.key;
                  if (next) setRows(current => current.map(item => item.key === row.key ? { key: next, value: "" } : item));
                }}>
                  {definitions.map(option => <option key={option.key} value={option.key} disabled={option.key !== row.key && rows.some(item => item.key === option.key)}>{option.label}</option>)}
                </Select>
              </label>
              {definition(row.key)?.multiple ? <fieldset className="min-w-0">
                <legend className="text-xs font-medium text-muted-foreground">{definition(row.key)?.label}</legend>
                <input type="hidden" name={row.key} value={row.value} />
                <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
                  {definition(row.key)?.options.map(option => <label key={option.value} className="flex items-center gap-1 text-xs">
                    <Checkbox checked={row.value.split(",").includes(option.value)} onChange={event => {
                      const checked = event.target.checked;
                      const choices = definition(row.key)!.options.filter(({ value }) =>
                        value === option.value ? checked : row.value.split(",").includes(value));
                      setRows(current => current.map(item => item.key === row.key ? { ...item, value: choices.map(choice => choice.value).join(",") } : item));
                    }} />{option.label}
                  </label>)}
                </div>
              </fieldset> : <label className="grid min-w-0 gap-0.5 text-xs font-medium text-muted-foreground">
                {t("filterValue")}
                <Select name={row.key} value={row.value} className={compactControl}
                  onChange={event => setRows(current => current.map(item => item.key === row.key ? { ...item, value: event.target.value } : item))}>
                  <option value="">{t("filterAll")}</option>
                  {definition(row.key)?.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </label>}
              <Button size="icon" tone="danger-outline" className="size-7 p-0" aria-label={t("removeFilter", { column: definition(row.key)?.label ?? row.key })}
                tooltip={t("removeFilter", { column: definition(row.key)?.label ?? row.key })} tooltipPlacement="bottom"
                onClick={() => setRows(current => current.filter(item => item.key !== row.key))}><X aria-hidden="true" className="size-3.5" /></Button>
            </div>)}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-border pt-2">
            <Button size="sm" className={compactControl} disabled={!available}
              onClick={() => { if (available) setRows(current => [...current, { key: available.key, value: "" }]); }}>
              <Plus aria-hidden="true" className="size-3.5" />{t("addFilter")}
            </Button>
            <div className="ml-auto flex flex-wrap justify-end gap-1.5">
              <Button size="sm" className={compactControl} disabled={!rows.some(row => row.value)} onClick={() => setRows([])}>{t("clearFilters")}</Button>
              <Button type="submit" size="sm" tone="accent" className={compactControl}>{t("applyFilters")}</Button>
            </div>
          </div>
        </form>
    </TableToolbarPanel>
  </div>;
}
