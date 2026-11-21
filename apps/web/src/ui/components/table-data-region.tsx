"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { tableMotion, tableStyles } from "./styles";

/** Retain the previous table height while new rows arrive, then ease to their height. */
export function TableDataRegion({ label, children }: { label: string; children: ReactNode }) {
  const region = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = region.current;
    const table = element?.querySelector("table");
    if (!element || !table) return;
    const measure = () => {
      if (!table.querySelector('tbody[aria-busy="true"]')) {
        const bodyHeight = Array.from(table.tBodies).filter(body => !body.hidden).reduce((height, body) => height + body.getBoundingClientRect().height, 0);
        if (bodyHeight > 0) element.style.setProperty("--table-loading-height", `${bodyHeight}px`);
      }
      const style = getComputedStyle(element);
      const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const scrollbar = Math.max(0, element.offsetHeight - element.clientHeight - borders);
      const height = `${Math.ceil(table.getBoundingClientRect().height + borders + scrollbar)}px`;
      if (element.style.height !== height) element.style.height = height;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table); observer.observe(element);
    const mutations = new MutationObserver(measure);
    mutations.observe(table, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "aria-busy"] });
    return () => { observer.disconnect(); mutations.disconnect(); };
  }, []);
  return <div ref={region} role="region" aria-label={label} tabIndex={0} className={tableStyles.region}
    style={{ "--table-motion-duration": `${tableMotion.durationMs}ms`, "--table-motion-easing": tableMotion.easing,
      transitionDuration: `${tableMotion.durationMs}ms`, transitionTimingFunction: tableMotion.easing } as CSSProperties}>
    {children}
  </div>;
}
