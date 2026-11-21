"use client";

import { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { basicStyles, cx } from "./styles.ts";
import { tooltipPosition, type TooltipPlacement } from "./tooltip-position.ts";

export type TooltipProps = {
  content: string;
  placement?: TooltipPlacement;
  children: ReactNode;
  className?: string;
  tooltipClassName?: string;
  /** Keep hints above native dialog/popover panels without changing their focus. */
  topLayer?: boolean;
};

export function Tooltip({ content, placement = "top", children, className, tooltipClassName, topLayer = false }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const arrow = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function show() {
    clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function hide() {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 100);
  }
  function dismiss() {
    clearTimeout(closeTimer.current);
    setOpen(false);
  }

  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!open) return;
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        clearTimeout(closeTimer.current);
        setOpen(false);
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    if (topLayer) bubble.current?.showPopover();
    function position() {
      if (!trigger.current || !bubble.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const bounds = bubble.current.getBoundingClientRect();
      const coordinates = tooltipPosition(anchor, bounds,
        { width: window.innerWidth, height: window.innerHeight }, placement);
      Object.assign(bubble.current.style, { left: `${coordinates.left}px`, top: `${coordinates.top}px`, visibility: "visible" });
      if (arrow.current) {
        // Follow the trigger center even when the bubble is clamped to a viewport edge.
        const horizontal = Math.max(10, Math.min(anchor.left + anchor.width / 2 - coordinates.left, bounds.width - 10));
        const vertical = Math.max(10, Math.min(anchor.top + anchor.height / 2 - coordinates.top, bounds.height - 10));
        const color = "hsl(var(--tooltip-background))";
        Object.assign(arrow.current.style, {
          left: "", right: "", top: "", bottom: "",
          borderWidth: "5px", borderColor: "transparent",
        }, placement === "top" ? {
          left: `${horizontal - 5}px`, bottom: "-6px", borderBottomWidth: "0", borderTopColor: color,
        } : placement === "bottom" ? {
          left: `${horizontal - 5}px`, top: "-6px", borderTopWidth: "0", borderBottomColor: color,
        } : placement === "left" ? {
          top: `${vertical - 5}px`, right: "-6px", borderRightWidth: "0", borderLeftColor: color,
        } : {
          top: `${vertical - 5}px`, left: "-6px", borderLeftWidth: "0", borderRightColor: color,
        });
      }
    }
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, placement, content, topLayer]);

  const child = isValidElement<{ "aria-describedby"?: string; lang?: string }>(children) ? children : null;
  const description = [child?.props["aria-describedby"], open ? id : undefined].filter(Boolean).join(" ") || undefined;
  return <span ref={trigger} className={cx(basicStyles.tooltipTrigger, className)}
    onPointerEnter={(event) => { if (event.pointerType !== "touch") show(); }} onPointerLeave={hide}
    onFocus={(event) => { if (event.target.matches(":focus-visible")) show(); }}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) hide(); }}>
    {child ? cloneElement(child, { "aria-describedby": description }) : children}
    {open && createPortal(<span ref={bubble} id={id} role="tooltip" popover={topLayer ? "manual" : undefined} lang={child?.props.lang} data-placement={placement}
      className={cx(basicStyles.tooltip, topLayer && "overflow-visible", tooltipClassName)} style={{ visibility: "hidden", ...(topLayer ? { inset: "auto", margin: 0 } : {}) }}
      onPointerEnter={dismiss}>{content}<span ref={arrow} aria-hidden="true"
        className="pointer-events-none absolute size-0 border-solid transition-none" /></span>, document.body)}
  </span>;
}
