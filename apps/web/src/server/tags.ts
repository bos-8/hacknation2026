import "server-only";
import { z } from "zod";
import { getDatabase } from "./database.ts";
import { tagDeleteSchema, tagQuerySchema, tagSaveSchema, tagStatusChangeSchema, type TagInput, type TagPage, type TagQuery, type TagResult, type TagStatusChange } from "../schemas/tag.ts";

export async function loadTags(input: TagQuery): Promise<TagPage> {
  const query = tagQuerySchema.parse(input);
  const search = query.search.replace(/[\\%_]/g, "\\$&");
  const where = {
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    ...(query.used ? { files: query.used === "yes" ? { some: {} } : { none: {} } } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const db = getDatabase();
  const [total, tags] = await db.$transaction([
    db.tag.count({ where }), db.tag.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit,
      orderBy: [{ [query.sort]: query.direction }, { uuid: "asc" }],
      select: { uuid: true, name: true, color: true, status: true, createdAt: true, updatedAt: true, createdByUuid: true, updatedByUuid: true, _count: { select: { files: true } } },
    }),
  ]);
  return { total, tags: tags.map(({ _count, ...tag }) => ({ ...tag, fileCount: _count.files })) };
}

export async function updateTagStatus(input: TagStatusChange, actorUuid: string): Promise<TagResult> {
  const parsed = tagStatusChangeSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(actorUuid).success) return { status: "invalid" };
  const { uuid, expectedUpdatedAt, expectedStatus, status } = parsed.data;
  const changed = await getDatabase().tag.updateMany({
    where: { uuid, status: expectedStatus, updatedAt: new Date(expectedUpdatedAt) }, data: { status, updatedByUuid: actorUuid },
  });
  return { status: changed.count === 1 ? "ok" : "conflict" };
}

export async function saveTag(input: TagInput, actorUuid: string): Promise<TagResult> {
  const parsed = tagSaveSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(actorUuid).success) return { status: "invalid" };
  const { uuid, expectedUpdatedAt, name, color } = parsed.data;
  try {
    if (!uuid) {
      await getDatabase().tag.create({ data: { name, color, createdByUuid: actorUuid, updatedByUuid: actorUuid }, select: { uuid: true } });
      return { status: "ok" };
    }
    const changed = await getDatabase().tag.updateMany({ where: { uuid, updatedAt: new Date(expectedUpdatedAt!) }, data: { name, color, updatedByUuid: actorUuid } });
    return { status: changed.count === 1 ? "ok" : "conflict" };
  } catch (error) { return { status: (error as { code?: string }).code === "P2002" ? "duplicate" : "failed" }; }
}

export async function deleteTag(input: z.infer<typeof tagDeleteSchema>): Promise<TagResult> {
  const parsed = tagDeleteSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { uuid, expectedUpdatedAt } = parsed.data;
  return getDatabase().$transaction(async tx => {
    const locked = await tx.$queryRaw<{ uuid: string }[]>`SELECT "uuid" FROM "tag" WHERE "uuid" = ${uuid}::uuid AND "updated_at" = ${new Date(expectedUpdatedAt)} FOR UPDATE`;
    if (!locked.length) return { status: "conflict" };
    if (await tx.fileTag.count({ where: { tagUuid: uuid } })) return { status: "inUse" };
    await tx.tag.delete({ where: { uuid } });
    return { status: "ok" };
  });
}
