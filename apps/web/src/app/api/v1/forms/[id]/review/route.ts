import { z } from "zod";
import { LOGGED_ACCESS } from "@/schemas/access";
import { formProcessingResult } from "@/schemas/form-upload";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { getDatabase } from "@/server/database";
import { jsonNoStore } from "@/server/http";
import { pythonEndpoint } from "../../../../../../../../../scripts/lib/pyworker-client.mjs";

const decision = z.strictObject({
  key: z.string().max(100), outcome: z.enum(["ACCEPT", "DECLINE"]),
  reason: z.string().trim().min(3).max(500), revision: z.number().int(),
});

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) return jsonNoStore({}, 403);
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status !== "allowed" || !access.context.actorUuid) return jsonNoStore({}, access.status === "unavailable" ? 503 : 401);
  const actor = access.context.actorUuid;
  const {id} = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonNoStore({}, 404);
  const input = decision.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonNoStore({}, 400);
  const {key, outcome, reason, revision} = input.data;
  const where = {fileUuid: id, file: {createdByUuid: actor, deletingAt: null}};
  try {
    const db = getDatabase();
    const form = await db.formUpload.findFirst({where, select: {processingJson: true, modifiedAt: true}});
    if (!form?.processingJson) return jsonNoStore({}, 404);
    const result = formProcessingResult.safeParse(form.processingJson).data;
    if (result?.mode !== "pipeline" || !result.form_ir?.extended || form.modifiedAt.getTime() !== revision) return jsonNoStore({}, 409);
    const profile = result.form_ir.extended;
    const candidate = profile.candidates.find(c => c.key === key);
    if (candidate?.decision !== "REVIEW" || candidate.resolution) return jsonNoStore({}, 409);
    const resolutions = Object.fromEntries(profile.candidates.filter(c => c.resolution).map(c => [c.key, c.resolution]));
    resolutions[key] = {outcome, reason, actor, at: new Date().toISOString()};
    const {url, headers} = pythonEndpoint(process.env, "/v1/forms/profiles/review");
    const response = await fetch(url, {method: "POST", headers, redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(15000), body: JSON.stringify({formId: id, procedure: result.form_ir.procedure,
        profileId: profile.profileId, version: profile.version, asOf: profile.asOf, resolutions})});
    if (!response.ok) return jsonNoStore({}, response.status === 422 ? 422 : 502);
    const compiled = await response.json();
    // Recompilation has no access to the original upload. Retain its observed source regions.
    if (!Array.isArray(compiled.form_ir?.evidence)) return jsonNoStore({}, 502);
    const observed = new Map(result.form_ir.evidence.map(e => [e.id, e]));
    compiled.form_ir.evidence = compiled.form_ir.evidence.map((e: {id: string}) => observed.get(e.id) ?? e);
    const updated = formProcessingResult.safeParse({...result, draft: compiled.draft, form_ir: compiled.form_ir});
    if (!updated.success || updated.data.mode !== "pipeline" ||
      updated.data.form_ir?.extended?.candidates.find(c => c.key === key)?.resolution?.outcome !== outcome) return jsonNoStore({}, 502);
    const saved = await db.formUpload.updateMany({where: {...where, modifiedAt: form.modifiedAt,
      processingJson: {equals: form.processingJson}}, data: {processingJson: updated.data}});
    return jsonNoStore({}, saved.count ? 200 : 409);
  } catch {
    return jsonNoStore({}, 503);
  }
}
