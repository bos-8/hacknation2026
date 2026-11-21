"use server";

import { randomUUID } from "node:crypto";
import { ocrPollSeconds } from "@formiq/database";
import { z } from "zod";
import { MAX_FILE_UPLOAD_BYTES } from "@/schemas/file-upload";
import { withAdminSession } from "@/server/auth/admin-action";
import { getDatabase } from "@/server/database";
import {
  documentExtensions,
  modeSchema,
  pagesSchema,
  variantSchema,
  type ReviewMode,
  type RunView,
  type Variant,
} from "@/schemas/document-review";

const active = { source: { file: { deletingAt: null } } };
const timingFields = { queuedAt: true, startedAt: true, sampledAt: true, estimateMs: true } as const;
const freshStage = () => ({ queuedAt: new Date(), startedAt: null, sampledAt: null, estimateMs: null });
const fail = { status: "conflict" as const };

export async function getAnalysis(fileUuid: string, version: number, mode: ReviewMode, start = false) {
  return withAdminSession(async (actorUuid) => {
    if (
      !z.uuid().safeParse(fileUuid).success ||
      !Number.isSafeInteger(version) ||
      !modeSchema.safeParse(mode).success
    )
      return fail;
    const db = getDatabase();
    const source = await db.fileVersion.findFirst({
      where: { fileUuid, version, file: { deletingAt: null } },
      select: { uuid: true, size: true, fileName: true, file: { select: { name: true } } },
    });
    if (
      !source ||
      source.size > BigInt(MAX_FILE_UPLOAD_BYTES) ||
      !documentExtensions.some(ext => (source.fileName ?? source.file.name).toLowerCase().endsWith(ext))
    )
      return fail;
    const key = { sourceUuid: source.uuid, actorUuid, mode };
    if (start)
      await db.documentAnalysis.upsert({
        where: { sourceUuid_actorUuid_mode: key },
        update: {},
        create: key,
        select: { uuid: true },
      });
    const record = await db.documentAnalysis.findFirst({
      where: { ...key, ...active },
      select: {
        uuid: true,
        stage: true,
        ...timingFields,
        ocrProgress: true,
        revision: true,
        pages: true,
        detector: true,
        exports: { select: { uuid: true, stage: true, variant: true, revision: true, progress: true, ...timingFields } },
      },
    });
    const run: RunView | null = record && {
      ...record,
      pages: record.stage === "ocr" ? [] : z.array(pagesSchema.element).parse(record.pages),
      exports: record.exports.filter((item) => item.revision === record.revision),
    };
    return { status: "ok" as const, run, pollSeconds: await ocrPollSeconds(db), activityId: start ? run?.uuid : undefined };
  });
}

export async function changeReview(
  uuid: string,
  revision: number,
  command: "save" | "approve" | "retry" | "edit" | "rerun",
  changes?: { index: number; page?: unknown },
) {
  return withAdminSession(async (actorUuid) => {
    if (!z.uuid().safeParse(uuid).success || !Number.isSafeInteger(revision)) return fail;
    const db = getDatabase();
    const where = { uuid, revision, actorUuid, ...active };
    const run = await db.documentAnalysis.findFirst({ where, select: { stage: true, pages: true } });
    if (!run) return fail;
    let stage = run.stage;
    const pages = z.array(pagesSchema.element).parse(run.pages);
    let rerunPage: number | undefined;
    if (
      command === "rerun" &&
      stage === "ocr_review" &&
      changes &&
      Number.isInteger(changes.index) &&
      pages[changes.index]
    ) {
      stage = "ocr";
      rerunPage = changes.index;
    } else if (command === "retry" && ["ocr_failed", "detect_failed"].includes(stage))
      stage = stage.split("_")[0];
    else if (command === "edit" && ["review", "approved"].includes(stage)) {
      // Reopen and apply text corrections atomically. Geometry and detector metadata come from the saved revision.
      if (changes) {
        const old = pages[changes.index];
        const next = pagesSchema.element.safeParse(changes.page);
        if (!old || !next.success || old.words.length !== next.data.words.length) return fail;
        old.words.forEach((word, i) => { word.text = next.data.words[i].text; });
      }
      stage = "ocr_review";
      for (const page of pages) for (const word of page.words) word.label = "";
    } else if (["save", "approve"].includes(command) && ["ocr_review", "review"].includes(stage)) {
      if (changes) {
        const old = pages[changes.index];
        const next = pagesSchema.element.safeParse(changes.page);
        if (!old || !next.success || old.width !== next.data.width || old.height !== next.data.height)
          return fail;
        pages[changes.index] = next.data;
      }
      if (command === "approve") stage = stage === "ocr_review" ? "detect" : "approved";
    } else return fail;
    if (Buffer.byteLength(JSON.stringify(pages)) > 4 * 1024 * 1024) return fail;
    const result = await db.$transaction(async (tx) => {
      const updated = await tx.documentAnalysis.updateMany({
        where: { ...where, stage: run.stage },
        data: {
          pages,
          stage,
          rerunPage,
          ...(["ocr", "detect"].includes(stage) && freshStage()),
          ...(stage === "ocr" && { ocrProgress: null }),
          revision: { increment: 1 },
          ticket: randomUUID(),
          dispatched: false,
        },
      });
      if (updated.count && command === "approve")
        await tx.documentApproval.create({
          data: { analysisUuid: uuid, revision: revision + 1, stage: run.stage, pages, actorUuid },
          select: { revision: true },
        });
      return updated;
    });
    return result.count ? { status: "ok" as const, activityId: stage !== run.stage ? uuid : undefined } : fail;
  });
}

export async function requestPdf(uuid: string, revision: number, variant: Variant) {
  return withAdminSession(async (actorUuid) => {
    if (
      !z.uuid().safeParse(uuid).success ||
      !variantSchema.safeParse(variant).success ||
      !Number.isSafeInteger(revision)
    )
      return fail;
    const db = getDatabase();
    const run = await db.documentAnalysis.findFirst({
      where: { uuid, actorUuid, revision, ...active },
      select: { stage: true },
    });
    if (
      !run ||
      !(
        run.stage === "approved" ||
        (variant === "original" && ["review", "ocr_review"].includes(run.stage))
      )
    )
      return fail;
    const key = { analysisUuid: uuid, revision, variant };
    const exp = await db.documentExport.upsert({
      where: { analysisUuid_revision_variant: key },
      create: key,
      update: {},
      select: { uuid: true, stage: true },
    });
    if (exp.stage === "failed")
      await db.documentExport.updateMany({
        where: { uuid: exp.uuid, stage: "failed" },
        data: { ...freshStage(), progress: null, dispatched: false, stage: "queued", ticket: randomUUID() },
      });
    return { status: "ok" as const, activityId: exp.uuid };
  });
}

/** Read only status metadata for the signed-in administrator's document jobs. */
export async function getDocumentActivity(watched: string[]) {
  return withAdminSession(async (actorUuid) => {
    if (!z.array(z.uuid()).max(1000).safeParse(watched).success) return fail;
    const db = getDatabase();
    const source = { select: { fileName: true, version: true, file: { select: { name: true } } } } as const;
    const [pollSeconds, analyses, exports] = await Promise.all([
      ocrPollSeconds(db),
      db.documentAnalysis.findMany({
        where: { actorUuid, ...active, OR: [{ stage: { in: ["ocr", "detect"] } }, { uuid: { in: watched } }] },
        select: { uuid: true, stage: true, ocrProgress: true, ...timingFields, source },
      }),
      db.documentExport.findMany({
        where: { analysis: { actorUuid, ...active }, OR: [{ stage: "queued" }, { uuid: { in: watched } }] },
        select: { uuid: true, stage: true, variant: true, progress: true, ...timingFields, analysis: { select: { source } } },
      }),
    ]);
    return { status: "ok" as const, pollSeconds, jobs: [
      ...analyses.map(({ uuid, stage, ocrProgress, source, ...timing }) => ({
        ...timing, uuid, stage, percent: stage === "ocr" ? ocrProgress : null, name: source.fileName ?? source.file.name, version: source.version, variant: null,
      })),
      ...exports.map(({ uuid, stage, variant, progress, analysis, ...timing }) => ({
        ...timing, uuid, stage, variant, percent: progress, name: analysis.source.fileName ?? analysis.source.file.name, version: analysis.source.version,
      })),
    ] };
  });
}
