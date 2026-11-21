export const MAX_FILE_UPLOAD_BYTES = 8 * 1024 * 1024;

export const fileUploadStatuses = ["ok", "invalid", "tooLarge", "denied", "uploadFailed", "conflict", "busy"] as const;
export type FileUploadResult = { status: typeof fileUploadStatuses[number] };
