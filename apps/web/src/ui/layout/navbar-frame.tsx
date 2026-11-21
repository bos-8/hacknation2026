"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { navbarAtTop } from "@/config/navigation";
import { cx } from "@/ui/basic/styles";
import { layoutStyles } from "./styles";

/** Reveal labels at the page top, on hover and keyboard focus; keep the shell observable by asides. */
export function NavbarFrame({ children, className }: { children: ReactNode; className?: string }) {
  const [atTop, setAtTop] = useState(true);
  const frame = useRef<HTMLElement>(null);
  useEffect(() => {
    let pending: number | undefined;
    const update = () => {
      pending = undefined;
      setAtTop(previous => navbarAtTop(previous, window.scrollY));
    };
    const schedule = () => { if (pending === undefined) pending = requestAnimationFrame(update); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("pageshow", schedule);
    const observer = new ResizeObserver(() => {
      // Anchor links should clear the largest header size, including a contextual second row.
      if (frame.current) {
        const secondary = frame.current.querySelector<HTMLElement>("[data-navbar-secondary]")?.getBoundingClientRect().height ?? 0;
        document.documentElement.style.setProperty("--navigation-height", `${Math.max(48 + secondary, frame.current.getBoundingClientRect().height)}px`);
      }
    });
    if (frame.current) observer.observe(frame.current);
    return () => {
      if (pending !== undefined) cancelAnimationFrame(pending);
      window.removeEventListener("scroll", schedule); window.removeEventListener("pageshow", schedule); observer.disconnect();
      document.documentElement.style.removeProperty("--navigation-height");
    };
  }, []);
  return <header ref={frame} data-navbar data-at-top={atTop} className={cx(layoutStyles.navbar, className)}>{children}</header>;
}
