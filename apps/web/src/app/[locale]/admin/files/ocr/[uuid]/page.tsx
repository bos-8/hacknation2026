import { Suspense } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ADMIN_ACCESS } from "@/schemas/access";
import { documentExtensions, modeSchema } from "@/schemas/document-review";
import { parseFileVersion } from "@/schemas/file-list";
import { MAX_FILE_UPLOAD_BYTES } from "@/schemas/file-upload";
import { requireAccess } from "@/server/auth/access";
import { getDatabase } from "@/server/database";
import { DocumentReview } from "../review";
import { ImageReview } from "../image-review";

export const instant = false;
type Props = PageProps<"/[locale]/admin/files/ocr/[uuid]">;

async function Content({ params, searchParams }: Props) {
  const { actorUuid } = await requireAccess(ADMIN_ACCESS);
  const { uuid } = await params;
  const query = await searchParams;
  const version = parseFileVersion(typeof query.version === "string" ? query.version : null);
  if (!actorUuid || !z.uuid().safeParse(uuid).success || !version) notFound();
  const db = getDatabase();
  const source = await db.fileVersion.findUnique({
    where: { fileUuid_version: { fileUuid: uuid, version }, file: { deletingAt: null } },
    select: { fileName: true, createdAt: true, file: { select: { name: true } }, size: true,
      analyses: { where: { actorUuid }, select: { mode: true, stage: true }, orderBy: { mode: "desc" } } },
  });
  if (!source || source.size > BigInt(MAX_FILE_UPLOAD_BYTES)) notFound();
  const name = source.fileName ?? source.file.name;
  if (!documentExtensions.some(ext => name.toLowerCase().endsWith(ext))) notFound();
  if (/\.(jpe?g|png)$/i.test(name)) return <ImageReview key={uuid + version} file={uuid}
    version={version} name={name} uploadedAt={source.createdAt.toISOString()} />;
  const requested = modeSchema.safeParse(query.mode);
  const preferred = source.analyses.find(a => a.stage === "approved") ?? source.analyses.find(a => a.stage === "review") ?? source.analyses[0];
  const mode = requested.success ? requested.data : modeSchema.parse(preferred?.mode ?? "manual");
  return <DocumentReview key={uuid + version + mode} file={uuid} version={version} name={name} mode={mode} />;
}

export default function Page(props: Props) {
  return <Suspense><Content {...props} /></Suspense>;
}
