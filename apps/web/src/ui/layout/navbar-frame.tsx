"use client";

import { type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { cx } from "@/ui/basic/styles";
import { layoutStyles } from "./styles";

export function NavbarFrame({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname() ?? "";
  const chat = pathname === "/chat";
  const glass = pathname === "/" || pathname === "/about" || pathname === "/about/team"
    || pathname === "/access-denied" || chat || pathname === "/chat/settings"
    || pathname === "/admin" || pathname.startsWith("/admin/")
    || pathname === "/forms" || pathname.startsWith("/forms/");
  return <header data-navbar data-navbar-chat={chat || undefined} data-navbar-glass={glass || undefined} className={cx(layoutStyles.navbar, className)}>{children}</header>;
}
