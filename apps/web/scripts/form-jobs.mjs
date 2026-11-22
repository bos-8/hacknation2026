import { Prisma } from "@formiq/database";
import { MAX_FORM_BYTES, formAnalysisFailure, formMediaType, formProcessingResult } from "../src/schemas/form-upload.ts";
import { pythonEndpoint } from "../../../scripts/lib/pyworker-client.mjs";
import { resultVersion } from "./form-version.mjs";

const outcome = (body, status = 200) => ({ status, body });

export async function processStoredForm(db, readSource, operationId, job, signal) {
  const { formId: id, actorUuid: actor, asOf, sender, previousHash, reanalyze } = job;
  try {
    const where = { fileUuid: id, file: { createdByUuid: actor, deletingAt: null } };
    const form = await db.formUpload.findFirst({
      where,
      select: { paid: true, processingJson: true, file: { select: {
        name: true, createdAt: true, versions: { where: { version: 1 }, select: { seaweedUuid: true } },
      } } },
    });
    const original = form?.file.versions[0];
    if (!form || !original) return outcome({}, 404);
    const previous = formProcessingResult.safeParse(form.processingJson).data;
    if (!form.paid) return outcome({ error: "payment_required" }, 402);
    if (previous?.operation_id === operationId) return outcome({ mode: previous.mode });
    if (resultVersion(form.processingJson) !== previousHash) return outcome({ error: "analysis_changed" }, 409);
    if (!reanalyze && form.paid && previous?.mode === "pipeline") {
      if (asOf && previous.form_ir?.extended?.asOf !== asOf) return outcome({error: "analysis_changed"}, 409);
      return outcome({ mode: previous.mode });
    }

    const bytes = await readSource(original.seaweedUuid, MAX_FORM_BYTES);
    const data = new FormData();
    data.set("metadata", JSON.stringify({
      paid: form.paid, form_id: id,
      sender: { uuid: actor, name: sender.name, email: sender.email },
      uploaded_at: form.file.createdAt.toISOString(), submitted_at: new Date().toISOString(),
    }));
    data.set("file", new Blob([new Uint8Array(bytes)], { type: formMediaType(form.file.name) }), form.file.name);

    const { url, headers } = pythonEndpoint(process.env, "/v1/forms/process");
    if (operationId) url.searchParams.set("operation_id", operationId);
    if (asOf) url.searchParams.set("as_of", asOf);
    const response = await fetch(url, {
      method: "POST", body: data, headers: { Authorization: headers.Authorization },
      redirect: "error", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(340_000)]),
    }).catch((error) => {
      if (error instanceof Error && error.name === "TimeoutError") throw error;
      return null;
    });
    if (!response) return outcome({ error: "worker_disconnected" }, 502);
    if (!response.ok) {
      const { detail } = await response.json().catch(() => ({}));
      if (response.status === 402 && detail === "payment_required") return outcome({ error: detail }, 402);
      if (response.status === 415 && detail === "format_mismatch") return outcome({ error: detail }, 415);
      if (response.status === 422 && detail === "invalid_sender") return outcome({ error: detail }, 422);
      if (response.status === 422 && detail === "reference_material_not_form") return outcome({ error: detail }, 422);
      if (typeof detail === "string" && /^(?:local_llm_failed|local_llm_document_unsupported|document_text_failed|ocr_only_(?:format_unsupported|no_fields)|eden_(?:not_configured|upload_failed|ocr_failed|llm_failed|llm_invalid_json|timeout|invalid_text)|pipeline_(?:unavailable|read_failed|llm_failed|invalid_json|timeout))$/.test(detail)) {
        const failure = formAnalysisFailure.safeParse({
          reason: response.headers.get("x-form-failure-reason") ?? undefined,
          phase: response.headers.get("x-form-failure-phase") ?? undefined,
          timeoutSeconds: Number(response.headers.get("x-form-timeout-seconds")) || undefined,
        }).data;
        return outcome({ error: detail, ...failure }, response.status);
      }
      if (response.status === 408) return outcome({ error: "worker_intake_timeout" }, 408);
      if ([413, 415, 422, 429].includes(response.status)) return outcome({}, response.status);
      return outcome({ error: "worker_disconnected" }, response.status === 503 ? 503 : 502);
    }

    const result = formProcessingResult.safeParse(await response.json().catch(() => null));
    if (!result.success || result.data.form_id !== id
        || result.data.file.size_bytes !== bytes.byteLength
        || result.data.file.media_type !== formMediaType(form.file.name)) {
      return outcome({ error: "worker_invalid_result" }, 502);
    }

    if ((previous?.mode === "pipeline" && result.data.mode !== "pipeline") ||
        (previous?.mode === "eden" && result.data.mode === "bypass")) {
      return outcome({ error: "reanalyze_unavailable" }, 503);
    }

    // Only replace the result we read before inference. Concurrent writes and payment
    // changes must be checked again after the worker responds.
    const saved = await db.formUpload.updateMany({
      where: { ...where, paid: true, processingJson: { equals: form.processingJson ?? Prisma.DbNull } },
      data: { processingJson: { ...result.data, operation_id: operationId } },
    });
    if (!saved.count) {
      const current = await db.formUpload.findFirst({ where, select: { paid: true, processingJson: true } });
      if (!current) return outcome({}, 404);
      if (!current.paid) return outcome({ error: "payment_required" }, 402);
      if (reanalyze) return outcome({ error: "analysis_changed" }, 409);
      const existing = formProcessingResult.safeParse(current.processingJson).data;
      return existing ? outcome({ mode: existing.mode }) : outcome({}, 409);
    }
    return outcome({ mode: result.data.mode });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return outcome({ error: "worker_response_timeout" }, 504);
    }
    return outcome({}, 503);
  }
}
