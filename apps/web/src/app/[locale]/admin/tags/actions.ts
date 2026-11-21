"use server";

import { withAdminSession } from "@/server/auth/admin-action";
import { deleteTag, loadTags, saveTag, updateTagStatus } from "@/server/tags";
import { tagDeleteSchema, tagQuerySchema, tagSaveSchema, tagStatusChangeSchema, type TagQuery, type TagResult, type TagStatusChange } from "@/schemas/tag";

export async function changeTagStatus(input: TagStatusChange): Promise<TagResult> {
  return withAdminSession(async actor => {
    const parsed = tagStatusChangeSchema.safeParse(input);
    if (!parsed.success) return { status: "invalid" as const };
    try { return await updateTagStatus(parsed.data, actor); } catch { return { status: "failed" as const }; }
  });
}

export async function refreshTags(query: TagQuery) {
  return withAdminSession(async () => {
    const parsed = tagQuerySchema.safeParse(query);
    if (!parsed.success) return { status: "failed" as const };
    try { return { status: "ok" as const, page: await loadTags(parsed.data) }; }
    catch { return { status: "failed" as const }; }
  });
}
export async function submitTag(form: FormData): Promise<TagResult> {
  return withAdminSession(async actor => {
    const parsed = tagSaveSchema.safeParse(Object.fromEntries(form.entries()));
    if (!parsed.success) return { status: "invalid" as const };
    return saveTag(parsed.data, actor);
  });
}
export async function removeTag(input: unknown): Promise<TagResult> {
  return withAdminSession(async () => {
    const parsed = tagDeleteSchema.safeParse(input);
    if (!parsed.success) return { status: "invalid" as const };
    try { return await deleteTag(parsed.data); } catch { return { status: "failed" as const }; }
  });
}
