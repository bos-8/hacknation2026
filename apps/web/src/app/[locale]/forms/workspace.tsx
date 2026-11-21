"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
export type FormEntry = {
  id: string; file: File; previewUrl: string;
  uploadedAt: number; uploader: string; coiJson: Record<string, unknown> | null;
  result: { status: "validated"; media_type: string; size_bytes: number };
};

type NewEntry = Omit<FormEntry, "previewUrl" | "uploadedAt" | "uploader" | "coiJson">;

const Workspace = createContext<{ entries: FormEntry[]; add: (entry: NewEntry) => void; remove: (entry: FormEntry) => void } | null>(null);

export function FormsProvider({ children, uploader }: { children: ReactNode; uploader: string }) {
  const [entries, setEntries] = useState<FormEntry[]>([]);
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const active = urls.current;
    return () => { active.forEach(url => URL.revokeObjectURL(url)); active.clear(); };
  }, []);
  function add(entry: NewEntry) {
    const previewUrl = URL.createObjectURL(entry.file.slice(0, entry.file.size, entry.result.media_type === "application/json" ? "text/plain" : entry.result.media_type));
    urls.current.add(previewUrl);
    const uploadedAt = Date.now();
    setEntries(previous => [{ ...entry, previewUrl, uploadedAt, uploader, coiJson: null }, ...previous]);
  }
  function remove(entry: FormEntry) {
    if (urls.current.delete(entry.previewUrl)) URL.revokeObjectURL(entry.previewUrl);
    setEntries(previous => previous.filter(item => item.id !== entry.id));
  }
  return <Workspace.Provider value={{ entries, add, remove }}>{children}</Workspace.Provider>;
}

export function useForms() {
  const workspace = useContext(Workspace);
  if (!workspace) throw new Error("Missing forms workspace");
  return workspace;
}
