"use server";

import { withAdminSession } from "@/server/auth/admin-action";
import { addDocumentRevision, deleteDocument, listDocumentRevisions, loadCatalogFile, updateDocumentStatus } from "@/server/file-catalog";
import { z } from "zod";
import { fileRevisionTargetSchema, fileVersionNumber, type FileListRow } from "@/schemas/file-list";
import { fileDeleteSchema, fileStatusChangeSchema, type FileDelete, type FileStatusChange, type FileStatusResult } from "@/schemas/file-status";

export async function readOlderRevisions(uuid: string, before: number) {
  return withAdminSession(async () => {
    if (!z.uuid().safeParse(uuid).success || !fileVersionNumber.safeParse(before).success) return { status: "invalid" as const };
    try { return { status: "ok" as const, ...await listDocumentRevisions(uuid, before) }; }
    catch { return { status: "failed" as const }; }
  });
}

export async function restoreFileRevision(input: { uuid: string; expectedVersion: number; version: number }): Promise<FileStatusResult> {
  return withAdminSession<FileStatusResult>(async actorUuid => {
    const parsed = fileRevisionTargetSchema.extend({ version: fileVersionNumber }).safeParse(input);
    if (!parsed.success) return { status: "invalid" };
    const { uuid, expectedVersion, version } = parsed.data;
    return addDocumentRevision(uuid, expectedVersion, actorUuid, { version });
  });
}

export async function readFilePreview(uuid: string): Promise<{ status: "ok"; file: FileListRow } | { status: "denied" | "failed" | "notFound" }> {
  return withAdminSession(async () => {
    if (!z.uuid().safeParse(uuid).success) return { status: "notFound" as const };
    try {
      const file = await loadCatalogFile(uuid);
      return file ? { status: "ok" as const, file } : { status: "notFound" as const };
    } catch { return { status: "failed" as const }; }
  });
}

export async function permanentlyDeleteFile(input: FileDelete): Promise<FileStatusResult> {
  return withAdminSession<FileStatusResult>(async actorUuid => {
    const parsed = fileDeleteSchema.safeParse(input);
    if (!parsed.success) return { status: "invalid" };
    try {
      return await deleteDocument(parsed.data, actorUuid);
    } catch {
      return { status: "failed" };
    }
  });
}

export async function changeFileStatus(input: FileStatusChange): Promise<FileStatusResult> {
  return withAdminSession<FileStatusResult>(async actorUuid => {
    const parsed = fileStatusChangeSchema.safeParse(input);
    if (!parsed.success) return { status: "invalid" };
    try {
      return await updateDocumentStatus(parsed.data, actorUuid);
    } catch {
      return { status: "failed" };
    }
  });
}
