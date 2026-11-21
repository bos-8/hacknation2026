"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { NotificationStore, type NotificationInput } from "./notification-store";

const Context = createContext<NotificationStore | null>(null);
const BellContext = createContext<RefObject<HTMLSpanElement | null> | null>(null);
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new NotificationStore());
  const bell = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const timer = setInterval(() => store.tick(), 250);
    const reset = () => store.resetPulse();
    document.addEventListener("visibilitychange", reset); window.addEventListener("pagehide", reset);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", reset); window.removeEventListener("pagehide", reset); };
  }, [store]);
  return <Context value={store}><BellContext value={bell}>{children}</BellContext></Context>;
}

export function useNotifications() {
  const store = useContext(Context);
  if (!store) throw new Error("useNotifications requires NotificationProvider");
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const owner = state.owner;
  // A callback retained by an old account cannot mutate a newly bound account's notifications.
  const actions = useMemo(() => {
    const owned = () => owner !== null && store.getSnapshot().owner === owner;
    return {
      pushNotification: (input: NotificationInput) => owned() ? store.push(input, Date.now(), !document.hidden) : undefined,
      closeNotification: (id: string) => { if (owned()) store.close(id); },
      removeNotification: (id: string) => { if (owned()) store.remove(id); },
      clearNotifications: () => { if (owned()) store.clear(); },
      pauseNotification: (id: string, reason: "hover" | "focus", paused: boolean) => { if (owned()) store.pause(id, reason, paused); },
      clearAnnouncement: (key: number) => { if (owned()) store.clearAnnouncement(key); },
    };
  }, [store, owner]);
  return { ...state, ...actions };
}

export function useNotificationBell() {
  const bell = useContext(BellContext);
  if (!bell) throw new Error("Notification bell requires NotificationProvider");
  return bell;
}

export function useNotificationOwner(owner: string) {
  const store = useContext(Context);
  if (!store) throw new Error("Notification owner requires NotificationProvider");
  useEffect(() => {
    store.bindOwner(owner);
    return () => { if (store.getSnapshot().owner === owner) store.bindOwner(null); };
  }, [store, owner]);
}
