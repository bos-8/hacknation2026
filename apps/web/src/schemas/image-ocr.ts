export type ImageOcrError = "notConfigured" | "unavailable" | "invalid" | "busy";
export type ImageOcrResult = { status: "ok"; text: string; model: string; uploadedAt: string } |
  { status: ImageOcrError | "denied" };
