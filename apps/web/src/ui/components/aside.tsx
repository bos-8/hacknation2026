"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentPropsWithoutRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { ThreeDotsVertical, X } from "react-bootstrap-icons";
import { Button, Tooltip } from "@/ui/basic";
import { cx } from "@/ui/basic/styles";
import { Blur } from "./blur";
import { useHydrated } from "./use-hydrated";
import { useAsideLayout } from "./aside-layout";
import { asideKeyboardWidth, asideSize, type AsideVariant } from "./aside-size";
import { asideStyles as styles } from "./styles";

export type AsideProps = Omit<ComponentPropsWithoutRef<"aside">, "title" | "children"> & {
  open: boolean;
  onClose: () => void;
  variant?: AsideVariant;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  triggerRef?: RefObject<HTMLElement | null>;
  closeLabel?: string;
  resizeLabel?: string;
  bodyClassName?: string;
  disableClose?: boolean;
};

const subscribeViewport = (callback: () => void) => {
  const observer = new ResizeObserver(callback);
  observer.observe(document.documentElement);
  window.addEventListener("resize", callback);
  return () => { observer.disconnect(); window.removeEventListener("resize", callback); };
};
const viewportSnapshot = () => document.documentElement.clientWidth;
const serverViewport = () => 0;
const serverOwner = () => null;

/** A full-height right-hand pane. Push mode becomes an overlay on narrow screens. */
export function Aside({ open, onClose, variant = "overlay", title, description, icon, actions, footer, children,
  defaultWidth = 360, minWidth = 280, maxWidth = 720,
  triggerRef, closeLabel, resizeLabel, bodyClassName, disableClose = false, className, id: suppliedId, ...props }: AsideProps) {
  const generatedId = useId();
  const id = suppliedId ?? `${generatedId}-aside`;
  const t = useTranslations("common.aside");
  const ready = useHydrated();
  const viewport = useSyncExternalStore(subscribeViewport, viewportSnapshot, serverViewport);
  const [desiredWidth, setDesiredWidth] = useState(defaultWidth);
  const [resizing, setResizing] = useState(false);
  const size = asideSize(viewport, desiredWidth, variant, minWidth, maxWidth);
  const effectiveVariant = size.mobile ? "overlay" : variant;
  const layer = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  const reject = useRef(onClose);
  const locked = useRef(disableClose);
  const { entries, register, unregister, ownership } = useAsideLayout();
  const ownerId = useSyncExternalStore(ownership.subscribe, ownership.getSnapshot, serverOwner);
  const visible = open && ownerId === id;
  const topId = Object.keys(entries).at(-1);
  useLayoutEffect(() => {
    close.current = disableClose ? () => {} : onClose;
    reject.current = onClose;
    locked.current = disableClose;
  }, [onClose, disableClose]);

  useLayoutEffect(() => {
    if (!open || !ready) return;
    if (!ownership.request(id, () => close.current(), () => locked.current)) reject.current();
    return () => ownership.release(id);
  }, [id, open, ready, ownership]);

  useEffect(() => {
    if (visible && ready) register(id, { variant: effectiveVariant, width: size.width, resizing });
    else unregister(id);
  }, [id, visible, ready, effectiveVariant, size.width, resizing, register, unregister]);
  useEffect(() => () => unregister(id), [id, unregister]);

  useLayoutEffect(() => {
    const element = layer.current;
    if (!ready || !element) return;
    const navbar = document.querySelector<HTMLElement>("[data-navbar]");
    const mainRow = navbar?.querySelector<HTMLElement>("[data-navbar-main]");
    const shellFooter = document.querySelector<HTMLElement>("[data-shell-footer]");
    const position = () => {
      if (mainRow) element.style.setProperty("--aside-header-height", `${mainRow.getBoundingClientRect().height}px`);
      if (shellFooter) element.style.setProperty("--aside-footer-height", `${shellFooter.getBoundingClientRect().height}px`);
    };
    position();
    const observer = new ResizeObserver(position);
    if (navbar) observer.observe(navbar);
    if (mainRow) observer.observe(mainRow);
    if (shellFooter) observer.observe(shellFooter);
    window.addEventListener("resize", position);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); };
  }, [ready, ownerId]);

  useLayoutEffect(() => {
    const element = layer.current;
    if (!ready || !element) return;
    let frame: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const restore = () => {
      const active = document.activeElement;
      if (active === document.body || panel.current?.contains(active)) {
        const target = triggerRef?.current ?? previousFocus.current;
        if (target?.isConnected) target.focus({ preventScroll: true });
      }
    };
    if (visible) {
      if (!element.matches(":popover-open")) {
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        element.dataset.open = "false";
        element.showPopover();
      }
      frame = requestAnimationFrame(() => { element.dataset.open = "true"; panel.current?.focus({ preventScroll: true }); });
    } else if (element.matches(":popover-open")) {
      element.dataset.open = "false";
      const finish = () => { restore(); element.hidePopover(); };
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
      else timer = setTimeout(finish, 200);
    }
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [visible, ready, triggerRef]);

  useEffect(() => {
    if (!visible || topId !== id) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open], [popover=auto]:popover-open")) return;
      event.preventDefault(); close.current();
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [visible, id, topId]);

  useEffect(() => {
    const element = layer.current;
    const target = triggerRef?.current ?? previousFocus.current;
    return () => {
      if (element?.contains(document.activeElement)) {
        if (target?.isConnected) target.focus({ preventScroll: true });
      }
    };
  }, [ready, triggerRef, ownerId]);

  // A replaced pane leaves the top layer immediately, including during its exit
  // animation. Its owner's onClose clears the originating row or URL state.
  if (!ready || ownerId !== null && ownerId !== id || open && !visible) return null;
  return createPortal(<div ref={layer} popover="manual" data-aside-layer data-variant={effectiveVariant} className={styles.layer}
    onToggle={event => { if (event.newState === "closed" && open) close.current(); }}>
    {effectiveVariant === "overlay" && <div aria-hidden="true" data-aside-backdrop className={styles.backdrop}
      onPointerDown={event => { if (open && event.target === event.currentTarget) close.current(); }}><Blur className="bg-black/20" /></div>}
    <aside {...props} id={id} ref={panel} tabIndex={-1} role={effectiveVariant === "overlay" ? "dialog" : undefined}
      aria-modal={effectiveVariant === "overlay" && open ? true : undefined}
      aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined} aria-hidden={!open} inert={!open}
      data-aside-panel data-variant={effectiveVariant} data-resizing={resizing} className={cx(styles.panel, className)} style={{ ...props.style, width: size.width }}>
      {!size.mobile && <div role="separator" aria-label={resizeLabel ?? t("resize")} aria-orientation="vertical"
        aria-controls={id} aria-valuemin={size.min} aria-valuemax={size.max} aria-valuenow={size.width} tabIndex={open ? 0 : -1}
        data-aside-resize className={styles.resize}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizing(true);
        }}
        onPointerMove={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) setDesiredWidth(Math.max(size.min, Math.min(size.max, viewport - event.clientX)));
        }}
        onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={() => setResizing(false)} onLostPointerCapture={() => setResizing(false)}
        onDoubleClick={() => setDesiredWidth(defaultWidth)}
        onKeyDown={event => {
          const next = asideKeyboardWidth(event.key, size.width, size.min, size.max, event.shiftKey);
          if (next !== null) { event.preventDefault(); setDesiredWidth(next); }
        }}>
          <span aria-hidden="true" className={styles.resizeGrip}><ThreeDotsVertical className="size-4" /></span>
        </div>}
      <header className={styles.header}>
        {icon}
        <div className="min-w-0 flex-1"><h2 id={`${id}-title`} className="text-sm font-semibold">{title}</h2>
          {description && <div id={`${id}-description`} className="truncate text-xs text-muted-foreground">{description}</div>}</div>
        <div className="flex shrink-0 gap-1">{actions}
          <Tooltip content={closeLabel ?? t("close")} placement="left" topLayer>
            <Button size="sm" tone="danger-outline" disabled={disableClose} aria-label={closeLabel ?? t("close")} className="size-8 min-h-8 shrink-0 p-0" onClick={() => close.current()}><X aria-hidden="true" className="size-4" /></Button>
          </Tooltip>
        </div>
      </header>
      <div className={cx(styles.body, bodyClassName)}>{children}</div>
      {footer !== null && <footer className={styles.footer}>
        {footer ?? <Button size="sm" disabled={disableClose} onClick={() => close.current()}>{closeLabel ?? t("close")}</Button>}
      </footer>}
    </aside>
  </div>, document.body);
}

export function OverlayAside(props: Omit<AsideProps, "variant">) { return <Aside {...props} variant="overlay" />; }
export function PushAside(props: Omit<AsideProps, "variant">) { return <Aside {...props} variant="push" />; }
