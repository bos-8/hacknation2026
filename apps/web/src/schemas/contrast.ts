export const CONTRAST_OPTIONS = ["normal", "high"] as const;
export type AppContrast = (typeof CONTRAST_OPTIONS)[number];

export function isAppContrast(value: unknown): value is AppContrast {
  return value === "normal" || value === "high";
}

export function getNextContrast(contrast: AppContrast): AppContrast {
  if (!isAppContrast(contrast)) throw new Error("Invalid contrast preference");
  return contrast === "normal" ? "high" : "normal";
}
