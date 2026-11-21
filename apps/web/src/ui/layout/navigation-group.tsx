"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Activity, BoxSeam, ChatDots, FileEarmarkText, Folder, Gear, Grid, HouseDoor, InfoCircle, LayoutSidebarReverse, ListTask, Palette, People, Person, Tags, UiChecksGrid } from "react-bootstrap-icons";
import { Link } from "@/i18n/navigation";
import { navigationActive, type NavigationItem } from "@/config/navigation";
import { cx } from "@/ui/basic/styles";
import { layoutStyles } from "./styles";

const icons = { ocr: FileEarmarkText, home: HouseDoor, about: InfoCircle, team: People, chat: ChatDots, admin: Grid, colors: Palette, asides: LayoutSidebarReverse, components: UiChecksGrid, user: Person, files: Folder, products: BoxSeam, tags: Tags, queue: ListTask, settings: Gear, monitoring: Activity };
const subscribeHash = (callback: () => void) => {
  window.addEventListener("hashchange", callback); window.addEventListener("popstate", callback);
  return () => { window.removeEventListener("hashchange", callback); window.removeEventListener("popstate", callback); };
};
const hashSnapshot = () => window.location.hash;
const serverHash = () => "";

/** Shared TrueGuard-style indicator for primary routes and contextual links. */
export function NavigationGroup({ items, pathname, label, variant = "primary", onNavigate }: {
  items: NavigationItem[]; pathname: string; label: string; variant?: "primary" | "secondary" | "mobile"; onNavigate?: () => void;
}) {
  const t = useTranslations("common.navigation");
  const locale = useLocale();
  const hash = useSyncExternalStore(subscribeHash, hashSnapshot, serverHash);
  const nav = useRef<HTMLElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const signature = items.map(item => item.href).join("|");
  useLayoutEffect(() => {
    const element = nav.current, marker = indicator.current;
    if (!element || !marker) return;
    const position = () => {
      const active = element.querySelector<HTMLElement>("[aria-current]");
      if (!active || !element.getBoundingClientRect().width) { delete element.dataset.indicator; marker.style.opacity = "0"; return; }
      const target = active.getBoundingClientRect(), bounds = element.getBoundingClientRect();
      marker.style.transitionDuration = element.dataset.indicator === "ready" ? "" : "0ms";
      marker.style.width = `${target.width}px`;
      marker.style.transform = `translateX(${target.left - bounds.left + element.scrollLeft - element.clientLeft}px)`;
      marker.style.opacity = "1"; element.dataset.indicator = "ready";
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element); element.querySelectorAll("a").forEach(item => observer.observe(item));
    element.addEventListener("scroll", position, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener("scroll", position); };
  }, [pathname, hash, signature, variant]);

  return <nav ref={nav} aria-label={label} data-navigation-group={variant} className={cx(layoutStyles.navGroup, variant === "primary" ? layoutStyles.navPrimary : variant === "secondary" ? layoutStyles.navSecondary : layoutStyles.navMobile)}>
    {variant !== "mobile" && <span ref={indicator} aria-hidden="true" className={layoutStyles.navIndicator} />}
    {items.map((item, index) => {
      const Icon = icons[item.icon], text = t(item.label), anchor = item.href.includes("#");
      const active = navigationActive(pathname, item) && (!anchor || (hash ? item.href.endsWith(hash) : index === 0));
      const attributes = { "aria-current": active ? anchor ? "location" as const : "page" as const : undefined,
        "aria-label": text, title: text, className: cx(layoutStyles.navItem, active && layoutStyles.navItemActive), onClick: onNavigate };
      const content = <><Icon aria-hidden="true" focusable="false" className="size-[18px] shrink-0" /><span className="navbar-link-label">{text}</span></>;
      return anchor ? <a key={item.href} {...attributes} href={`/${locale}${item.href}`}>{content}</a>
        : <Link key={item.href} {...attributes} href={item.href}>{content}</Link>;
    })}
  </nav>;
}
