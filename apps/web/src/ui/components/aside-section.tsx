"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "react-bootstrap-icons";
import { asideSectionMotion, asideSectionStyles as styles } from "./styles";

export function AsideSection({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  useEffect(() => () => clearTimeout(timer.current), []);
  function toggle() {
    clearTimeout(timer.current);
    if (expanded) {
      setExpanded(false);
      timer.current = setTimeout(() => setMounted(false), asideSectionMotion.durationMs);
    } else { setMounted(true); setExpanded(true); }
  }
  return <section className={styles.section}>
    <button type="button" className={styles.toggle} aria-expanded={expanded} aria-controls={id} onClick={toggle}>
      {title}<ChevronDown aria-hidden="true" className={styles.icon}
        style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transitionDuration: `${asideSectionMotion.durationMs}ms` }} />
    </button>
    <div id={id} inert={!expanded} aria-hidden={!expanded} className={styles.content}
      style={{ gridTemplateRows: expanded ? "1fr" : "0fr", transitionDuration: `${asideSectionMotion.durationMs}ms` }}>
      <div className={styles.clip}>{mounted && <div className={styles.padding}>{children}</div>}</div>
    </div>
  </section>;
}
