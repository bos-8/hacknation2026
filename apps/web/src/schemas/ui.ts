import type { ReactNode } from "react";

export type PopupProps = {
  size?: "default" | "wide";
  children?: ReactNode;
  onClose: () => void;
  ariaLabel?: string;
  closeButtonAriaLabel?: string;
  title?: ReactNode;
  content?: ReactNode;
  actions?: ReactNode;
  actionsClassName?: string;
  disableClose?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
};
