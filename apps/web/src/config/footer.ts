import type { AppLocale } from "@/schemas/i18n";

export const footerLegalDocuments = ["terms", "privacy", "browserStorage"] as const;

type LegalDocument = (typeof footerLegalDocuments)[number];
type LegalDocumentHref = `/${string}` | `https://${string}`;

// Add published document URLs by locale. Terms and privacy show a pending label until linked.
export const footerLegalLinks: Partial<Record<AppLocale, Partial<Record<LegalDocument, LegalDocumentHref>>>> = {};
