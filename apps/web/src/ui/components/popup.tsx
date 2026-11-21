"use client";

import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Dialog } from "@/ui/basic";
import { cx } from "@/ui/basic/styles";
import type { PopupProps } from "@/schemas/ui";
import { useHydrated } from "./use-hydrated";
import { popupStyles } from "./styles";
import { Blur } from "./blur";
import { lockBodyScroll } from "./body-scroll";
import { registerPopup, isTopPopup } from "./popup-stack";

export type { PopupProps } from "@/schemas/ui";

/** TrueGuard's Popup API/layout, backed by the native modal primitive. Mount while open. */
export function Popup({ size = "default", children, onClose, ariaLabel, closeButtonAriaLabel,
  title, content, actions, actionsClassName, disableClose = false, closeOnBackdropClick = true,
  closeOnEscape = true, showCloseButton = true }: PopupProps) {
  const t = useTranslations("common.ui");
  const ready = useHydrated();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const structured = title !== undefined || content !== undefined || actions !== undefined;
  const hasTitle = title !== undefined && title !== null;
  const canClose = !disableClose;
  const closeButton = canClose && showCloseButton;

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useLayoutEffect(() => {
    if (!ready || !dialog.current) return;
    const element = dialog.current;
    // Native cancel must be prevented before the browser closes a busy dialog.
    const cancel = (event: Event) => { if (!canClose || !closeOnEscape) event.preventDefault(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !isTopPopup(element)) return;
      event.preventDefault();
      if (canClose && closeOnEscape) onCloseRef.current();
    };
    element.addEventListener("cancel", cancel);
    window.addEventListener("keydown", escape);
    return () => { element.removeEventListener("cancel", cancel); window.removeEventListener("keydown", escape); };
  }, [ready, canClose, closeOnEscape]);
  useEffect(() => {
    if (!ready || !dialog.current) return;
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlockScroll = lockBodyScroll();
    element.showModal();
    const unregister = registerPopup(element);
    return () => {
      unregister();
      element.close();
      unlockScroll();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [ready]);

  if (!ready) return null;
  return createPortal(<Blur><Dialog ref={dialog} role="dialog" aria-modal="true"
    aria-label={ariaLabel ?? (hasTitle ? undefined : t("dialog"))}
    aria-labelledby={hasTitle && !ariaLabel ? `${id}-title` : undefined}
    aria-describedby={content !== undefined || !structured ? `${id}-content` : undefined}
    onClose={() => { if (dialog.current?.isConnected && !dialog.current.open) onCloseRef.current(); }}
    onClick={event => {
      if (event.target !== event.currentTarget || !canClose || !closeOnBackdropClick) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onCloseRef.current();
    }}
    className={cx(popupStyles.frame, popupStyles.sizes[size])}>
    {(hasTitle || closeButton) && <div className={popupStyles.header}>
        {hasTitle && <h2 id={`${id}-title`} className={popupStyles.title}>{title}</h2>}
        {closeButton && <Button size="icon" tone="danger-outline" aria-label={closeButtonAriaLabel ?? t("closeDialog")}
          onClick={() => onCloseRef.current()}
          className={popupStyles.close}>
          <svg aria-hidden="true" className={popupStyles.closeIcon} fill="none" viewBox="0 0 20 20">
            <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          </svg>
        </Button>}
      </div>}
    {structured ? <>
      {content !== undefined && <div id={`${id}-content`} className={popupStyles.content}>{content}</div>}
      {actions !== undefined && <div className={popupStyles.actions}><div className={cx(popupStyles.actionGrid, actionsClassName)}>{actions}</div></div>}
    </> : <div id={`${id}-content`} className={popupStyles.customContent}>{children}</div>}
  </Dialog></Blur>, document.body);
}
