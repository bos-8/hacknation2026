"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { Button } from "@/ui/basic/button";
import { useHydrated } from "@/ui/components/use-hydrated";
import { cx } from "@/ui/basic/styles";
import { layoutStyles } from "./styles";

/** Native auto-popover owns outside-click/Escape dismissal and invoker focus restoration. */
export function NavbarPopover({ label, icon, children, className, align = "right" }: {
  label: string; icon: ReactNode; children: ReactNode; className?: string; align?: "left" | "right";
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const ready = useHydrated();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => { if (panel.current?.matches(":popover-open")) panel.current.hidePopover(); }, [pathname]);
  useEffect(() => {
    const element = panel.current;
    const navigate = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("a[href]") && element?.matches(":popover-open")) element.hidePopover();
    };
    element?.addEventListener("click", navigate);
    return () => element?.removeEventListener("click", navigate);
  }, []);
  useLayoutEffect(() => {
    if (!ready) return;
    const position = () => {
      if (!panel.current || !trigger.current) return;
      const viewport = document.documentElement.clientWidth, width = Math.min(288, viewport - 16);
      const top = document.querySelector<HTMLElement>("[data-navbar]")?.getBoundingClientRect().bottom ?? trigger.current.getBoundingClientRect().bottom;
      const left = align === "left" ? 8 : Math.max(8, Math.min(viewport - width - 8, trigger.current.getBoundingClientRect().right - width));
      Object.assign(panel.current.style, { top: `${top + 8}px`, left: `${left}px`, width: `${width}px`, maxHeight: `${Math.max(0, window.innerHeight - top - 16)}px` });
    };
    position();
    const observer = new ResizeObserver(position);
    const navbar = document.querySelector<HTMLElement>("[data-navbar]");
    if (navbar) observer.observe(navbar);
    window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [ready, align]);
  return <div className={cx("shrink-0", className)}>
    <Button ref={trigger} size="sm" disabled={!ready} aria-label={label} title={label} aria-expanded={open} aria-controls={id}
      popoverTarget={id} popoverTargetAction="toggle" className="size-8 shrink-0 p-0">{icon}</Button>
    <div ref={panel} id={id} popover="auto" role="region" aria-label={label} className={layoutStyles.navPopover}
      onToggle={event => setOpen(event.newState === "open")}>
      {children}
    </div>
  </div>;
}
