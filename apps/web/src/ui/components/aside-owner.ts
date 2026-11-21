/** A single pane owns the shell. A locked mutation cannot be displaced. */
export function createAsideOwner() {
  let current: { id: string; close: () => void; locked: () => boolean } | null = null;
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => current?.id ?? null,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    request(id: string, close: () => void, locked: () => boolean) {
      if (current?.id === id) return true;
      if (current?.locked()) return false;
      const previous = current;
      current = { id, close, locked };
      emit();
      previous?.close();
      return true;
    },
    release(id: string) {
      if (current?.id !== id) return;
      current = null;
      emit();
    },
  };
}
