import { randomUUID } from "node:crypto";
import { z } from "zod";
import { LOGGED_ACCESS } from "@/schemas/access";
import { formAnalysisProgress, formProcessingResult } from "@/schemas/form-upload";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { getSession } from "@/server/auth/session";
import { getDatabase } from "@/server/database";
import { getJobQueue } from "@/server/queue";
import { resultVersion } from "../../../../../../../scripts/form-version.mjs";
import { jsonNoStore } from "@/server/http";
import { pythonEndpoint } from "../../../../../../../../../scripts/lib/pyworker-client.mjs";


export async function GET(request: Request, context: RouteContext<"/api/v1/forms/[id]/process">) {
  const { id } = await context.params;
  const operationId = new URL(request.url).searchParams.get("operation");
  if (!z.uuid().safeParse(id).success || (operationId !== null && !z.uuid().safeParse(operationId).success)) return jsonNoStore({}, 404);
  try {
    const session = await getSession();
    if (!session || new Date(session.session.expiresAt).getTime() <= Date.now()) return jsonNoStore({}, 401);

    const job = await getJobQueue().formJob(id, session.user.id, operationId);
    if (!job) return jsonNoStore({}, 404);
    if (job.state === "completed") return jsonNoStore({ state: "completed", mode: job.output?.body?.mode });
    if (job.state === "failed" || job.state === "cancelled") {
      return jsonNoStore({ state: "failed", ...job.output?.body }, job.output?.status ?? 503);
    }
    const pending = { operation: job.id, state: "processing", stage: "accepted" };
    if (job.state !== "active") return jsonNoStore({ ...pending, state: "queued", stage: "queued" });
    // Live progress is optional. The durable job remains authoritative between stages.
    const { url, headers } = pythonEndpoint(process.env, "/v1/forms/process");
    url.search = new URLSearchParams({ operation_id: job.id, form_id: id, sender_id: session.user.id }).toString();
    const response = await fetch(url, {
      headers: { Authorization: headers.Authorization }, redirect: "error", cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(3000)]),
    }).catch(() => null);
    if (!response?.ok) {
      await response?.body?.cancel();
      return jsonNoStore(pending);
    }
    const progress = formAnalysisProgress.safeParse(await response.json());
    return jsonNoStore({ ...pending, ...progress.data });
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
  const asOf = query.get("as_of");
  if (asOf !== null && !z.iso.date().safeParse(asOf).success) return jsonNoStore({}, 400);
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
      select: { paid: true, processingJson: true },
    });
    if (!form) return jsonNoStore({}, 404);
    if (!form.paid) return jsonNoStore({ error: "payment_required" }, 402);
    const previous = formProcessingResult.safeParse(form.processingJson).data;
    if (!reanalyze && form.paid && previous?.mode === "pipeline") {
      if (asOf && previous.form_ir?.extended?.asOf !== asOf) return jsonNoStore({error: "analysis_changed"}, 409);
      return jsonNoStore({ mode: previous.mode });
    }

    const operation = await getJobQueue().enqueueForm(operationId ?? randomUUID(), {
      formId: id, actorUuid: actor, sender: { name: session.user.name, email: session.user.email },
      previousHash: resultVersion(form.processingJson), asOf, reanalyze,
    });
    return jsonNoStore({ operation, state: "queued" }, 202);
  } catch {
    return jsonNoStore({}, 503);
  }
}
