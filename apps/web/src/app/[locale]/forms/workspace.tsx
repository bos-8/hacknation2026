"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { FormProcessingResult } from "@/schemas/form-upload";

export type FormEntry = {
  id: string; paid: boolean; file: { name: string; lastModified: number }; previewUrl: string;
  uploadedAt: number; uploaderUuid: string; processingJson: FormProcessingResult | null;
  result: { status: "uploaded"; media_type: string; size_bytes: number };
};

const Workspace = createContext<FormEntry[]>([]);
export function FormsProvider({ children, entries }: { children: ReactNode; entries: FormEntry[] }) {
  return <Workspace.Provider value={entries}>{children}</Workspace.Provider>;
}
export function useForms() { return { entries: useContext(Workspace) }; }
