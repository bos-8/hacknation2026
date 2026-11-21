import { Prisma } from "@formiq/database";
import { z } from "zod";
import { LOGGED_ACCESS } from "@/schemas/access";
import { MAX_FORM_BYTES, formAnalysisFailure, formAnalysisProgress, formMediaType, formProcessingResult } from "@/schemas/form-upload";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { getSession } from "@/server/auth/session";
import { getDatabase } from "@/server/database";
import { getFileStore } from "@/server/files";
import { jsonNoStore } from "@/server/http";
import { pythonEndpoint } from "../../../../../../../../../scripts/lib/pyworker-client.mjs";

// Allow the worker up to 30 s for multipart intake and 300 s for conversion.
const workerRequestTimeoutMs = 340_000;

export async function GET(request: Request, context: RouteContext<"/api/v1/forms/[id]/process">) {
  const { id } = await context.params;
  const operationId = new URL(request.url).searchParams.get("operation");
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(operationId).success) return jsonNoStore({}, 404);
  try {
    const session = await getSession();
    if (!session || new Date(session.session.expiresAt).getTime() <= Date.now()) return jsonNoStore({}, 401);

    // Pyworker matches the full operation, form and sender tuple to the active upload.
    const { url, headers } = pythonEndpoint(process.env, "/v1/forms/process");
    url.search = new URLSearchParams({ operation_id: operationId!, form_id: id, sender_id: session.user.id }).toString();
    const response = await fetch(url, {
      headers: { Authorization: headers.Authorization }, redirect: "error", cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(3000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return jsonNoStore({}, response.status === 404 ? 404 : 503);
    }
    const progress = formAnalysisProgress.safeParse(await response.json());
    return progress.success ? jsonNoStore(progress.data) : jsonNoStore({}, 502);
  } catch {
    return jsonNoStore({}, 503);
  }
}

export async function POST(request: Request, context: RouteContext<"/api/v1/forms/[id]/process">) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) return jsonNoStore({}, 403);
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status !== "allowed" || !access.context.actorUuid) return jsonNoStore({}, access.status === "unavailable" ? 503 : 401);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonNoStore({}, 404);

  const query = new URL(request.url).searchParams;
  const reanalyze = query.get("reanalyze") === "1";
  const operationId = query.get("operation");
  if (operationId !== null && !z.uuid().safeParse(operationId).success) return jsonNoStore({}, 400);

  try {
    const actor = access.context.actorUuid;
    const session = await getSession();
    if (!session || session.user.id !== actor) return jsonNoStore({ error: "invalid_sender" }, 422);
    const db = getDatabase();
    const where = { fileUuid: id, file: { createdByUuid: actor, deletingAt: null } };
    const form = await db.formUpload.findFirst({
      where,
      select: { paid: true, processingJson: true, file: { select: {
        name: true, createdAt: true, versions: { where: { version: 1 }, select: { seaweedUuid: true } },
      } } },
    });
    const original = form?.file.versions[0];
    if (!form || !original) return jsonNoStore({}, 404);
    const previous = formProcessingResult.safeParse(form.processingJson).data;
    if (!reanalyze && form.paid && previous?.mode === "pipeline") return jsonNoStore({ mode: previous.mode });

    const bytes = await getFileStore().get(original.seaweedUuid, MAX_FORM_BYTES);
    const data = new FormData();
    data.set("metadata", JSON.stringify({
      paid: form.paid, form_id: id,
      sender: { uuid: actor, name: session.user.name, email: session.user.email },
      uploaded_at: form.file.createdAt.toISOString(), submitted_at: new Date().toISOString(),
    }));
    data.set("file", new Blob([new Uint8Array(bytes)], { type: formMediaType(form.file.name) }), form.file.name);

    const { url, headers } = pythonEndpoint(process.env, "/v1/forms/process");
    if (operationId) url.searchParams.set("operation_id", operationId);
    const response = await fetch(url, {
      method: "POST", body: data, headers: { Authorization: headers.Authorization },
      redirect: "error", cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(workerRequestTimeoutMs)]),
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "TimeoutError") throw error;
      return null;
    });
    if (!response) return jsonNoStore({ error: "worker_disconnected" }, 502);
    if (!response.ok) {
      const { detail } = await response.json().catch(() => ({}));
      if (response.status === 402 && detail === "payment_required") return jsonNoStore({ error: detail }, 402);
      if (response.status === 415 && detail === "format_mismatch") return jsonNoStore({ error: detail }, 415);
      if (response.status === 422 && detail === "invalid_sender") return jsonNoStore({ error: detail }, 422);
      if (typeof detail === "string" && /^(?:local_llm_failed|local_llm_document_unsupported|document_text_failed|ocr_only_(?:format_unsupported|no_fields)|eden_(?:not_configured|upload_failed|ocr_failed|llm_failed|llm_invalid_json|timeout|invalid_text)|pipeline_(?:unavailable|read_failed|llm_failed|invalid_json|timeout))$/.test(detail)) {
        const failure = formAnalysisFailure.safeParse({
          reason: response.headers.get("x-form-failure-reason") ?? undefined,
          phase: response.headers.get("x-form-failure-phase") ?? undefined,
          timeoutSeconds: Number(response.headers.get("x-form-timeout-seconds")) || undefined,
        }).data;
        return jsonNoStore({ error: detail, ...failure }, response.status);
      }
      if (response.status === 408) return jsonNoStore({ error: "worker_intake_timeout" }, 408);
      if ([413, 415, 422, 429].includes(response.status)) return jsonNoStore({}, response.status);
      return jsonNoStore({ error: "worker_disconnected" }, response.status === 503 ? 503 : 502);
    }

    const result = formProcessingResult.safeParse(await response.json().catch(() => null));
    if (!result.success || result.data.form_id !== id
        || result.data.file.size_bytes !== bytes.byteLength
        || result.data.file.media_type !== formMediaType(form.file.name)) {
      return jsonNoStore({ error: "worker_invalid_result" }, 502);
    }

    if ((previous?.mode === "pipeline" && result.data.mode !== "pipeline") ||
        (previous?.mode === "eden" && result.data.mode === "bypass")) {
      return jsonNoStore({ error: "reanalyze_unavailable" }, 503);
    }

    // Only replace the result we read before inference. Concurrent writes and payment
    // changes must be checked again after the worker responds.
    const saved = await db.formUpload.updateMany({
      where: { ...where, paid: true, processingJson: { equals: form.processingJson ?? Prisma.DbNull } },
      data: { processingJson: result.data },
    });
    if (!saved.count) {
      const current = await db.formUpload.findFirst({ where, select: { paid: true, processingJson: true } });
      if (!current) return jsonNoStore({}, 404);
      if (!current.paid) return jsonNoStore({ error: "payment_required" }, 402);
      if (reanalyze) return jsonNoStore({ error: "analysis_changed" }, 409);
      const existing = formProcessingResult.safeParse(current.processingJson).data;
      return existing ? jsonNoStore({ mode: existing.mode }) : jsonNoStore({}, 409);
    }
    return jsonNoStore({ mode: result.data.mode });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return jsonNoStore({ error: "worker_response_timeout" }, 504);
    }
    return jsonNoStore({}, 503);
  }
}
