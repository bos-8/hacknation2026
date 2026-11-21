"use client";

import { useEffect, useRef } from "react";
import { ChevronUp } from "react-bootstrap-icons";
import { Button } from "@/ui/basic";
import { basicStyles, buttonTones, cx } from "@/ui/basic/styles";

export function TablePageSize({ limit, label, sizes, disabled = false }: { limit: number; label: string; sizes: readonly number[]; disabled?: boolean }) {
  const details = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      const menu = details.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return <details ref={details} inert={disabled} aria-disabled={disabled || undefined}
    className={cx("group/page-size relative w-18", disabled && "pointer-events-none opacity-50")} onKeyDown={event => {
    if (event.key !== "Escape" || !event.currentTarget.open) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.open = false;
    trigger.current?.focus();
  }}>
    <summary ref={trigger} tabIndex={disabled ? -1 : undefined} aria-label={`${label}: ${limit}`} title={label}
      className={cx(basicStyles.button, buttonTones.main, "flex h-8 list-none justify-between px-2 [&::-webkit-details-marker]:hidden")}>
      {limit}<ChevronUp aria-hidden="true" className="size-3 transition-transform duration-200 group-open/page-size:rotate-180 motion-reduce:transition-none" />
    </summary>
    <div className="absolute inset-x-0 bottom-full z-20 mb-1 rounded-md border border-panel-border bg-panel p-1 shadow-panel">
      {sizes.map(size => <Button key={size} disabled={disabled} tone={size === limit ? "accent" : "ghost"} size="sm"
        onClick={() => { if (details.current) details.current.open = false; trigger.current?.focus(); }}
        type="submit" name="limit" value={size} aria-current={size === limit ? "true" : undefined} className="w-full justify-start">
        {size}
      </Button>)}
    </div>
  </details>;
}

