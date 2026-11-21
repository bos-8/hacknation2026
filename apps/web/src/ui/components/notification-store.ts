import type { ReactNode } from "react";

export type NotificationMode = "success" | "warning" | "error" | "info";
export type NotificationInput = {
  id?: string; mode: NotificationMode; title?: string; message: ReactNode;
  persistent?: boolean; dismissible?: boolean; autoCloseMs?: number; brief?: boolean; pending?: boolean;
  onDismiss?: () => void | Promise<void>;
};
export type NotificationItem = NotificationInput & { id: string; createdAt: number; remainingMs: number | null };
export type NotificationAnnouncement = Pick<NotificationItem, "id" | "mode" | "title" | "message" | "pending"> & {
  key: number;
  until: number;
  retained: boolean;
};
export const NOTIFICATION_PRIORITY: NotificationMode[] = ["error", "warning", "success", "info"];
export function notificationSummary(items: readonly { mode: NotificationMode }[]) {
  const counts = { error: 0, warning: 0, success: 0, info: 0 };
  for (const item of items) counts[item.mode]++;
  return { counts, dominant: NOTIFICATION_PRIORITY.find(mode => counts[mode] > 0) ?? "info" };
}
type Snapshot = {
  owner: string | null; items: NotificationItem[];
  pulse: { key: number; mode: NotificationMode; until: number } | null;
  announcement: NotificationAnnouncement | null;
};
const EMPTY: Snapshot = { owner: null, items: [], pulse: null, announcement: null };
type Clock = { deadline: number; pausedAt: number | null; pauses: Set<string> };

/** In-memory UI state only; no tokens, browser persistence or cross-account reuse. */
export class NotificationStore {
  private snapshot: Snapshot = EMPTY;
  private listeners = new Set<() => void>();
  private clocks = new Map<string, Clock>();
  private sequence = 0;
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => EMPTY;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(value: Snapshot) { this.snapshot = value; for (const listener of this.listeners) listener(); }
  bindOwner(owner: string | null) {
    if (owner === this.snapshot.owner) return;
    this.clocks.clear(); this.publish({ ...EMPTY, owner });
  }
  push(input: NotificationInput, now = Date.now(), visible = true) {
    if (!this.snapshot.owner) return;
    const id = input.id ?? `notification-${++this.sequence}`;
    const previous = this.snapshot.items.find(item => item.id === id);
    const duration = Math.min(86400000, Math.max(0, Number.isFinite(input.autoCloseMs) ? input.autoCloseMs! : 5000));
    const persistent = input.persistent ?? (input.mode === "warning" || input.mode === "error");
    const remainingMs = persistent || input.dismissible === false ? null : duration;
    const announce = (retained: boolean, durationMs: number): NotificationAnnouncement => ({
      id, mode: input.mode, title: input.title, message: input.message, pending: input.pending,
      key: ++this.sequence, retained, until: now + durationMs,
    });
    if (input.brief && (input.pending || remainingMs !== null)) {
      this.clocks.delete(id);
      const current = this.snapshot.announcement;
      const announcement = input.pending || (visible && duration > 0)
        ? announce(false, Math.min(duration, 5000)) : current?.id === id ? null : current;
      this.publish({ ...this.snapshot, items: this.snapshot.items.filter(item => item.id !== id), announcement });
      return id;
    }
    const item = { ...input, id, createdAt: now, remainingMs };
    this.clocks.delete(id);
    if (remainingMs !== null) this.clocks.set(id, { deadline: now + remainingMs, pausedAt: null, pauses: new Set() });
    let pulse = this.snapshot.pulse;
    let announcement = this.snapshot.announcement;
    if (announcement?.id === id && announcement.pending) announcement = null;
    if (visible && (!previous || previous.mode !== input.mode)) {
      pulse = pulse && pulse.until > now ? { ...pulse, mode: input.mode }
        : { key: ++this.sequence, mode: input.mode, until: now + 3000 };
      if (remainingMs === null || remainingMs > 0) announcement = announce(remainingMs === null, Math.min(remainingMs ?? 4000, 5000));
    }
    this.publish({ ...this.snapshot, items: [item, ...this.snapshot.items.filter(item => item.id !== id)], pulse, announcement });
    return id;
  }
  private dismissed(item: NotificationItem) {
    try { void Promise.resolve(item.onDismiss?.()).catch(() => undefined); } catch { /* Callback failure must not lock the UI. */ }
  }
  close(id: string) {
    const item = this.snapshot.items.find(item => item.id === id);
    if (!item || item.dismissible === false) return;
    this.remove(id); this.dismissed(item);
  }
  remove(id: string) {
    this.clocks.delete(id);
    const announcement = this.snapshot.announcement;
    this.publish({ ...this.snapshot, items: this.snapshot.items.filter(item => item.id !== id),
      announcement: announcement?.id === id ? null : announcement });
  }
  clear() {
    const removed = this.snapshot.items.filter(item => item.dismissible !== false);
    for (const item of removed) this.clocks.delete(item.id);
    const announcement = this.snapshot.announcement;
    this.publish({ ...this.snapshot, items: this.snapshot.items.filter(item => item.dismissible === false),
      announcement: removed.some(item => item.id === announcement?.id) ? null : announcement });
    for (const item of removed) this.dismissed(item);
  }
  pause(id: string, reason: "hover" | "focus", paused: boolean, now = Date.now()) {
    const clock = this.clocks.get(id);
    if (!clock) return;
    if (paused) { if (!clock.pauses.size) clock.pausedAt = now; clock.pauses.add(reason); }
    else {
      clock.pauses.delete(reason);
      if (!clock.pauses.size && clock.pausedAt !== null) { clock.deadline += now - clock.pausedAt; clock.pausedAt = null; }
    }
    this.tick(now);
  }
  resetPulse() { if (this.snapshot.pulse) this.publish({ ...this.snapshot, pulse: null }); }
  clearAnnouncement(key: number) {
    if (this.snapshot.announcement?.key === key && !this.snapshot.announcement.pending) this.publish({ ...this.snapshot, announcement: null });
  }
  tick(now = Date.now()) {
    let changed = false;
    const items = this.snapshot.items.flatMap(item => {
      const clock = this.clocks.get(item.id);
      if (!clock) return [item];
      const remainingMs = Math.max(0, clock.deadline - (clock.pausedAt ?? now));
      if (!remainingMs) { this.clocks.delete(item.id); changed = true; return []; }
      if (Math.ceil(remainingMs / 1000) !== Math.ceil((item.remainingMs ?? 0) / 1000)) { changed = true; return [{ ...item, remainingMs }]; }
      return [item];
    });
    const pulse = this.snapshot.pulse && this.snapshot.pulse.until > now ? this.snapshot.pulse : null;
    if (changed || pulse !== this.snapshot.pulse) this.publish({ ...this.snapshot, items, pulse });
  }
}
