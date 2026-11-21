import { z } from "zod";

export const fileStatusSchema = z.enum(["active", "inactive", "pending_deletion", "softdelete", "pending_archiving"]);
export const FILE_STATUSES = fileStatusSchema.options;
export type FileStatus = z.infer<typeof fileStatusSchema>;

/** Available target states, shared by the table and server-side validation. */
export const FILE_STATUS_TRANSITIONS: Record<FileStatus, readonly FileStatus[]> = {
  active: ["inactive", "pending_archiving", "pending_deletion"],
  inactive: ["active", "pending_archiving", "pending_deletion"],
  pending_deletion: ["active", "inactive", "pending_archiving"],
  softdelete: ["active", "inactive", "pending_archiving", "pending_deletion"],
  pending_archiving: ["active", "inactive", "pending_deletion"],
};

export function canChangeFileStatus(from: FileStatus, to: FileStatus) {
  return FILE_STATUS_TRANSITIONS[from].includes(to);
}

export const fileStatusChangeSchema = z.object({
  uuid: z.uuid(),
  expectedStatus: fileStatusSchema,
  status: fileStatusSchema,
}).refine(input => canChangeFileStatus(input.expectedStatus, input.status), {
  message: "File status transition is not allowed",
  path: ["status"],
});

export type FileStatusChange = z.infer<typeof fileStatusChangeSchema>;
export type FileStatusResult = { status: "ok" | "invalid" | "denied" | "conflict" | "inUse" | "failed" };

export const fileDeleteSchema = z.object({
  uuid: z.uuid(), expectedStatus: fileStatusSchema,
  expectedVersion: z.number().int().min(1).max(2147483647).optional(),
});
export type FileDelete = z.infer<typeof fileDeleteSchema>;

export type FileDetails = {
  uuid: string;
  status: FileStatus;
  createdAt: Date;
  updatedAt: Date;
  createdByUuid: string;
  updatedByUuid: string;
  tags: string[];
  deletingAt?: Date | null;
};
