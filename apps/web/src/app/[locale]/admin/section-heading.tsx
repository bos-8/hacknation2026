"use client";

import { useSelectedLayoutSegments } from "next/navigation";
import { Heading } from "@/ui/basic";

export function AdminSectionHeading({ title }: { title: string }) {
  const [section, feature] = useSelectedLayoutSegments();
  return <header className="mb-4 border-b border-border pb-3">
    <Heading level={1} id="admin-title">{section === "files" && feature === "ocr" ? "OCR" : title}</Heading>
  </header>;
}
