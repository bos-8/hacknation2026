import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/schemas/i18n";
import { fileListQuerySchema, type FileListQuery } from "@/schemas/file-list";
import { withAdminSession } from "@/server/auth/admin-action";
import { loadFileList, loadOcrFileList } from "@/server/file-catalog";
import { Heading } from "@/ui/basic";
import { FilesResults } from "./files-results";
import { FilePreviewPanel } from "./file-preview-panel";

export async function FileCatalogView({ locale, query, ocr = false }: {
  locale: AppLocale; query: FileListQuery; ocr?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: ocr ? "common.documentReview" : "common.admin.files" });
  async function refreshFiles(nextQuery: FileListQuery) {
    "use server";
    return withAdminSession(async actorUuid => {
      const parsed = fileListQuerySchema.safeParse(nextQuery);
      if (!parsed.success) return { status: "failed" as const };
      const page = await (ocr ? loadOcrFileList(parsed.data, actorUuid) : loadFileList(parsed.data)).catch(() => null);
      return page ? { status: "ok" as const, page } : { status: "failed" as const };
    });
  }

  return <article aria-labelledby="files-title" className="min-w-0 space-y-1">
    <Heading level={2} id="files-title" className="pb-4 text-xl">{t("title")}</Heading>
    <FilesResults ocr={ocr} locale={locale} query={query} initial={null} refreshAction={refreshFiles} />
    {!ocr && <FilePreviewPanel />}
  </article>;
}
