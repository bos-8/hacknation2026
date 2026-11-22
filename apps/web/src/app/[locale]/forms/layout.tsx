import { Suspense, type ReactNode } from "react";
import { requireAccess } from "@/server/auth/access";
import { LOGGED_ACCESS } from "@/schemas/access";
import { formProcessingResult, formMediaType } from "@/schemas/form-upload";
import { getDatabase } from "@/server/database";
import { FormsProvider, type FormEntry } from "./workspace";

export const instant = false;

async function PrivateForms({ children }: { children: ReactNode }) {
  const access = await requireAccess(LOGGED_ACCESS);
  const actor = access.actorUuid!;
  const forms = await getDatabase().formUpload.findMany({
    where: { file: { createdByUuid: actor, deletingAt: null } },
    orderBy: { fileUuid: "desc" },
    select: { paid: true, processingJson: true, modifiedAt: true, file: { select: { uuid: true, name: true, createdAt: true, createdByUuid: true,
      versions: { where: { version: 1 }, select: { size: true } } } } },
  });
  const entries: FormEntry[] = forms.map(({ file, modifiedAt, paid, processingJson }) => ({
    id: file.uuid, paid, file: { name: file.name, lastModified: modifiedAt.getTime() },
    previewUrl: `/api/v1/forms/${file.uuid}`, uploadedAt: file.createdAt.getTime(),
    uploaderUuid: file.createdByUuid, processingJson: formProcessingResult.safeParse(processingJson).data ?? null,
    result: { status: "uploaded", media_type: formMediaType(file.name), size_bytes: Number(file.versions[0].size) },
  }));
  return <FormsProvider entries={entries}>{children}</FormsProvider>;
}

export default function FormsLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}><PrivateForms>{children}</PrivateForms></Suspense>;
}
