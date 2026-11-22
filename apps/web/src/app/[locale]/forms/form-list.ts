import { formExtensions } from "@/schemas/form-formats";
import { isProcessedForm, MAX_FORM_BYTES } from "@/schemas/form-upload";
import type { FormEntry } from "./workspace";

export const MAX_FORM_FILES = 8;
export const formSortColumns = ["name", "extension", "size", "processed", "paid"] as const;
type FormSortColumn = typeof formSortColumns[number];

export function fileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function sortFormEntries(entries: FormEntry[], column: FormSortColumn | undefined, descending: boolean, locale: string) {
  if (!column) return entries;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  return entries.toSorted((a, b) => {
    let order: number;
    switch (column) {
      case "name": order = collator.compare(a.file.name, b.file.name); break;
      case "extension": order = collator.compare(fileExtension(a.file.name), fileExtension(b.file.name)); break;
      case "size": order = a.result.size_bytes - b.result.size_bytes; break;
      case "processed": order = Number(isProcessedForm(a.processingJson)) - Number(isProcessedForm(b.processingJson)); break;
      case "paid": order = Number(a.paid) - Number(b.paid); break;
    }
    return descending ? -order : order;
  });
}

export function invalidFormSelection(files: File[]) {
  if (files.length > MAX_FORM_FILES) return { reason: "tooMany" } as const;
  for (const file of files) {
    if (!file.size || !formExtensions.includes("." + fileExtension(file.name))) return { reason: "invalid", file } as const;
    if (file.size > MAX_FORM_BYTES) return { reason: "large", file } as const;
  }
  return null;
}

export async function uploadFormFile(file: File) {
  try {
    const response = await fetch("/api/v1/forms", {
      method: "POST", body: file, headers: {
        "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name),
        "X-File-Modified": String(file.lastModified),
      },
    });
    if (response.ok) return null;
    switch (response.status) {
      case 401: case 403: return "denied";
      case 413: return "large";
      case 415: return (await response.json().catch(() => null))?.error === "format_mismatch" ? "formatMismatch" : "invalid";
      case 422: return "invalid";
      case 429: return "busy";
    }
  } catch {
    // A failed request leaves this file selected for a retry.
  }
  return "failed";
}
