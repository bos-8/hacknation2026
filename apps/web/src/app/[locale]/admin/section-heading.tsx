"use client";

import { useSelectedLayoutSegments } from "next/navigation";
import { FileEarmarkText, Grid } from "react-bootstrap-icons";
import { Heading } from "@/ui/basic";

export function AdminSectionHeading({ title }: { title: string }) {
  const [section, feature] = useSelectedLayoutSegments();
  const ocr = section === "files" && feature === "ocr";
  const Icon = ocr ? FileEarmarkText : Grid;
  return <header className="glass-panel flex items-center gap-4 p-5 sm:p-6">
    <span className="glass-icon grid size-11 shrink-0 place-items-center rounded-xl"><Icon aria-hidden="true" className="size-5" /></span>
    <Heading level={1} id="admin-title" className="min-w-0 text-2xl leading-tight tracking-tight sm:text-3xl">{ocr ? "OCR" : title}</Heading>
  </header>;
}
