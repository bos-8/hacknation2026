import { randomUUID } from "node:crypto";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { pythonEndpoint } from "../../../scripts/lib/pyworker-client.mjs";

import { readObject } from "./read-object.mjs";

const LIMIT = 8 * 1024 * 1024;
const eligible = { source: { file: { deletingAt: null } } };

export function documentJobs(database, queue, env) {
  const storage = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION || "eu-central-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_APP_ACCESS_KEY,
      secretAccessKey: env.S3_APP_SECRET_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const bucket = env.S3_BUCKET;
  async function call(source, operation, pages = [], variant = "original", pageIndex = null, ticket = null) {
    const form = new FormData();
    form.set("task", JSON.stringify({ operation, pages, variant, page_index: pageIndex, ...(ticket && { ticket }) }));
    if (operation !== "detect") {
      if (source.size > BigInt(LIMIT)) throw new Error("Document too large");
      const object = await storage.send(
        new GetObjectCommand({ Bucket: bucket, Key: source.seaweedUuid }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
      if (object.ContentLength !== Number(source.size) || !object.Body) {
        object.Body?.destroy();
        throw new Error("Source changed");
      }
      form.set("source", new Blob([await object.Body.transformToByteArray()]), "source");
    }
    const { url, headers } = pythonEndpoint(env, "/v1/tasks/document");
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      body: form,
      headers: { Authorization: headers.Authorization },
      signal: AbortSignal.timeout(165000),
    });
    if (!response.ok || Number(response.headers.get("content-length") || Infinity) > 16 * 1024 * 1024) {
      await response.body?.cancel();
      throw new Error("Document task failed");
    }
    return response;
  }

  // Bootstrap short jobs from the actor's recent successful jobs with similar input sizes.
  function similarSource(source) {
    return { size: { gte: source.size / 2n, lte: source.size * 2n } };
  }
  async function startAttempt(table, ticket, history, durationField, progressField) {
    const samples = await table.findMany({
      where: { ...history, [durationField]: { gt: 0 } }, select: { [durationField]: true },
      orderBy: { queuedAt: "desc" }, take: 5,
    });
    const durations = samples.map(row => row[durationField]).sort((a, b) => a - b);
    const middle = Math.floor(durations.length / 2);
    const estimateMs = durations.length === 0 ? null : durations.length % 2 === 1
      ? durations[middle] : Math.round((durations[middle - 1] + durations[middle]) / 2);
    const startedAt = new Date();
    await table.updateMany({ where: { ticket }, data: {
      startedAt, sampledAt: null, estimateMs,
      ...(progressField && { [progressField]: null }),
    } });
    return startedAt;
  }

  async function publish(job) {
    const { analysis } = job;
    if (
      analysis.revision !== job.revision ||
      (job.variant !== "original" && analysis.stage !== "approved")
    ) {
      await database.documentExport.updateMany({
        where: { ticket: job.ticket },
        data: { stage: "obsolete" },
      });
      return;
    }
    const started = await startAttempt(database.documentExport, job.ticket,
      { analysis: { source: similarSource(analysis.source), actorUuid: analysis.actorUuid }, variant: job.variant },
      "durationMs", "progress");
    const response = await call(analysis.source, "export", analysis.pages, job.variant, null, job.ticket);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > LIMIT || Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-")
      throw new Error("Invalid PDF");
    const key = randomUUID();
    const actor = analysis.actorUuid;
    const name = `document-${job.variant}-${job.uuid.slice(0, 8)}.pdf`;
    try {
      await storage.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: "application/pdf",
        }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
      await database.$transaction(async (tx) => {
        const claim = await tx.documentExport.updateMany({
          where: {
            uuid: job.uuid,
            stage: "queued",
            ticket: job.ticket,
            analysis: { revision: job.revision, ...eligible },
          },
          data: { stage: "ready", progress: 100, durationMs: Date.now() - started.getTime() },
        });
        if (!claim.count) throw new Error("Export superseded");
        await tx.file.create({
          data: {
            uuid: job.uuid,
            name,
            createdByUuid: actor,
            updatedByUuid: actor,
            versions: {
              create: {
                version: 1,
                fileName: name,
                seaweedUuid: key,
                size: bytes.length,
                createdByUuid: actor,
              },
            },
          },
        });
      });
    } catch (error) {
      // A lost commit acknowledgement can still mean the catalog owns this object.
      if (
        !(await database.fileVersion.findUnique({
          where: { seaweedUuid: key },
        }))
      ) {
        await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      }
      throw error;
    }
  }

  async function process(ticket, lastAttempt) {
    const run = await database.documentAnalysis.findFirst({
      where: { ticket, stage: { in: ["ocr", "detect"] }, ...eligible },
      select: {
        uuid: true,
        source: true,
        stage: true,
        pages: true,
        mode: true,
        revision: true,
        rerunPage: true, actorUuid: true,
      },
    });
    try {
      if (run) {
        const durationField = run.stage === "ocr" ? "ocrMs" : "detectMs";
        const started = await startAttempt(database.documentAnalysis, ticket,
          { source: similarSource(run.source), actorUuid: run.actorUuid }, durationField,
          run.stage === "ocr" ? "ocrProgress" : null);
        const response = await call(
          run.source,
          run.stage,
          run.stage === "detect" ? run.pages : [],
          "original",
          run.rerunPage,
          run.stage === "ocr" ? ticket : null,
        );
        let data;
        if (run.stage === "ocr") {
          const form = await response.formData();
          const pages = JSON.parse(await form.get("pages").text());
          const previews = await Promise.all(
            form.getAll("preview").map(async (p) => new Uint8Array(await p.arrayBuffer())),
          );
          if (!pages.length || previews.length !== pages.length) throw new Error("Missing page");
          if (run.rerunPage !== null) {
            if (pages.length !== 1 || !run.pages[run.rerunPage]) throw new Error("Invalid OCR page");
            const previous = await database.documentAnalysis.findUniqueOrThrow({
              where: { ticket },
              select: { originalPages: true, previews: true },
            });
            run.pages[run.rerunPage] = pages[0];
            previous.originalPages[run.rerunPage] = pages[0];
            previous.previews[run.rerunPage] = previews[0];
            data = { pages: run.pages, ...previous, stage: "ocr_review", rerunPage: null };
          } else {
            data = {
              pages,
              originalPages: pages,
              previews,
              stage: run.mode === "auto" ? "detect" : "ocr_review",
            };
          }
        } else {
          const { pages, detector } = await response.json();
          data = { pages, detector, stage: "review" };
        }
        await database.documentAnalysis.updateMany({
          where: { ticket, revision: run.revision, ...eligible },
          data: {
            ...data,
            [durationField]: Date.now() - started.getTime(),
            ...(data.stage === "detect" && { queuedAt: new Date(), startedAt: null, sampledAt: null, estimateMs: null }),
            ...(run.stage === "ocr" && { ocrProgress: 100 }),
            revision: { increment: 1 },
            ticket: randomUUID(),
            dispatched: false,
          },
        });
      } else {
        const job = await database.documentExport.findFirst({
          where: { ticket, stage: "queued", analysis: eligible },
          include: {
            analysis: {
              select: { source: true, revision: true, stage: true, pages: true, actorUuid: true },
            },
          },
        });
        if (job) await publish(job);
      }
    } catch {
      const waiting = { queuedAt: new Date(), startedAt: null, sampledAt: null, estimateMs: null };
      if (run) {
        await database.documentAnalysis.updateMany({
          where: { ticket, stage: run.stage },
          data: lastAttempt ? { stage: run.stage + "_failed" }
            : { ...waiting, ...(run.stage === "ocr" && { ocrProgress: null }) },
        });
      } else {
        await database.documentExport.updateMany({
          where: { ticket, stage: "queued" },
          data: lastAttempt ? { stage: "failed" } : { ...waiting, progress: null },
        });
      }
      throw new Error("Document processing failed");
    }
  }

  async function dispatch() {
    for (const [table, stages] of [
      [database.documentAnalysis, ["ocr", "detect"]],
      [database.documentExport, ["queued"]],
    ]) {
      const rows = await table.findMany({
        where: { dispatched: false, stage: { in: stages } },
        orderBy: { uuid: "asc" },
        take: 32,
        select: { ticket: true },
      });
      for (const { ticket } of rows) {
        await queue.dispatchDocument(ticket);
        await table.updateMany({
          where: { ticket },
          data: { dispatched: true },
        });
      }
      // Exhaustion during a process outage can skip the handler's final attempt.
      const pending = await table.findMany({
        where: { dispatched: true, stage: { in: stages } },
        select: { ticket: true, stage: true },
        orderBy: { uuid: "asc" },
        take: 128,
      });
      const expired = new Set(await queue.undeliverableDocuments(pending.map((row) => row.ticket)));
      for (const { ticket, stage } of pending) {
        if (expired.has(ticket))
          await table.updateMany({
            where: { ticket, stage },
            data: { stage: stage === "queued" ? "failed" : stage + "_failed" },
          });
      }
    }
  }
  return { process, dispatch, readSource: (key, limit) => readObject(storage, bucket, key, limit), close: () => storage.destroy() };
}
