"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, XCircle } from "react-bootstrap-icons";
import { Button, Input, Tooltip } from "@/ui/basic";
import { cx } from "@/ui/basic/styles";
import { tableSearchOptions, tableSearchStyles } from "./styles";

export function TableSearch({ action, value, inputId, namespace, preserved }: {
  action: string; value: string; inputId: string; namespace: string; preserved: Record<string, string>;
}) {
  const t = useTranslations(namespace);
  const [expanded, setExpanded] = useState(Boolean(value));
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const open = expanded || Boolean(value);
  const clearLabel = t(value ? "clear" : "collapseSearch");
  const iconAction = "absolute top-1/2 size-6 -translate-y-1/2 p-0 text-muted-foreground hover:text-foreground";

  function clearOrCollapse() {
    const field = input.current;
    if (field) field.value = "";
    if (value) field?.form?.requestSubmit();
    else {
      setExpanded(false);
      requestAnimationFrame(() => trigger.current?.focus());
    }
  }

  return <div data-search-expanded={open} className={tableSearchStyles.frame}
    style={{ width: open ? tableSearchOptions.expandedWidth : tableSearchOptions.collapsedWidth }}>
    <div className={cx(tableSearchStyles.trigger, open ? tableSearchStyles.hidden : tableSearchStyles.shown)} inert={open}>
      <Button ref={trigger} size="icon" className="size-7 p-0" aria-label={t("search")} aria-expanded={open}
        aria-controls={inputId + "-form"} tooltip={t("search")} tooltipPlacement="bottom"
        onClick={() => {
          setExpanded(true);
          requestAnimationFrame(() => input.current?.focus());
        }}>
        <Search aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
    <form data-table-query id={inputId + "-form"} action={action} method="get" role="search" inert={!open} aria-hidden={!open}
      className={cx(tableSearchStyles.form, open ? tableSearchStyles.shown : tableSearchStyles.hidden)}>
      {Object.entries(preserved).map(([name, field]) => <input key={name} type="hidden" name={name} value={field} />)}
      <Input ref={input} key={value} id={inputId} name="search" defaultValue={value} maxLength={200}
        aria-label={t("searchLabel")} placeholder={t("searchPlaceholder")} className="h-7 min-h-0 py-0 pr-16 text-xs" />
      <Tooltip content={clearLabel} placement="bottom" className="absolute right-8 top-1/2 -translate-y-1/2">
        <Button tone="ghost" size="icon" className="size-6 p-0 text-muted-foreground hover:text-foreground" aria-label={clearLabel} onClick={clearOrCollapse}>
          <XCircle aria-hidden="true" className="size-3.5" />
        </Button>
      </Tooltip>
      <Button type="submit" tone="ghost" size="icon" className={`${iconAction} right-1`} aria-label={t("search")} title={t("search")}>
        <Search aria-hidden="true" className="size-3.5" />
      </Button>
    </form>
  </div>;
}
