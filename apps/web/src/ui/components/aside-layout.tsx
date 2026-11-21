"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode, type CSSProperties } from "react";
import type { AsideVariant } from "./aside-size";
import { lockBodyScroll } from "./body-scroll";
import { createAsideOwner } from "./aside-owner";

type Reservation = { variant: AsideVariant; width: number; resizing: boolean };
const AsideContext = createContext<{
  ownership: ReturnType<typeof createAsideOwner>;
  entries: Record<string, Reservation>;
  register: (id: string, entry: Reservation) => void;
  unregister: (id: string) => void;
} | null>(null);

/** The shell owns reserved space; individual route components own their aside content. */
export function AsideProvider({ children }: { children: ReactNode }) {
  const [ownership] = useState(createAsideOwner);
  const [entries, setEntries] = useState<Record<string, Reservation>>({});
  const register = useCallback((id: string, entry: Reservation) => setEntries(current => {
    const old = current[id];
    return old?.variant === entry.variant && old.width === entry.width && old.resizing === entry.resizing ? current : { ...current, [id]: entry };
  }), []);
  const unregister = useCallback((id: string) => setEntries(current => {
    if (!Object.hasOwn(current, id)) return current;
    const next = { ...current }; delete next[id]; return next;
  }), []);
  const context = useMemo(() => ({ entries, register, unregister, ownership }), [entries, register, unregister, ownership]);
  const overlayOpen = Object.values(entries).some(entry => entry.variant === "overlay");
  useEffect(() => { if (overlayOpen) return lockBodyScroll(); }, [overlayOpen]);
  return <AsideContext value={context}>{children}</AsideContext>;
}

export function useAsideLayout() {
  const context = useContext(AsideContext);
  if (!context) throw new Error("Aside requires AsideProvider in the application shell");
  return context;
}

/** Push panels reserve space beside the shell. Overlays block the shell. */
export function AsideContent({ children, header }: { children: ReactNode; header?: ReactNode }) {
  const { entries } = useAsideLayout();
  const values = Object.values(entries);
  const width = Math.max(0, ...values.filter(entry => entry.variant === "push").map(entry => entry.width));
  return <div data-aside-content inert={values.some(entry => entry.variant === "overlay")}
    data-resizing={values.some(entry => entry.resizing)} className="aside-content flex min-w-0 flex-1 flex-col"
    style={{ "--aside-reserved-width": `${width}px` } as CSSProperties}>
    {header}
    {children}
  </div>;
}
