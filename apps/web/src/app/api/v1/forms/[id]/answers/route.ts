import { z } from "zod";
import { LOGGED_ACCESS } from "@/schemas/access";
import { activeFields, addressGroups, editorFields, isCountryField, needsRuleAnalysis, validatorFor, type AddressChoices, type CheckResult } from "@/schemas/answer-editor";
import { countryCode } from "@/schemas/countries";
import { getIdentityDirectory } from "@/server/auth/directory";
import dictionaryProfile from "@/schemas/address-validation.json";
import { answerValues, formProcessingResult, type AnswerValues } from "@/schemas/form-upload";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { getDatabase } from "@/server/database";
import { jsonNoStore } from "@/server/http";
import { pythonEndpoint } from "../../../../../../../../../scripts/lib/pyworker-client.mjs";

const bodySchema = z.strictObject({answers: answerValues, save: z.boolean(), prefillSelf: z.boolean().optional(), revision: z.number().int(),
  analyzedAt:z.iso.datetime({offset:true}),answerVersion:z.uuid().nullable(),reviewCount:z.number().int().nonnegative()});
const workerChecks = z.array(z.object({field:z.uuid(), validatorId:z.string(), status:z.enum(["VALID","INVALID","UNVERIFIED","UNAVAILABLE","NOT_APPLICABLE"])}));
const profileState = z.object({states:z.record(z.string(),z.string()), errors:z.record(z.string(),z.string())});
const maxBodyBytes = 2 * 1024 * 1024;

async function readAnswers(request: Request) {
  if (Number(request.headers.get("content-length")) > maxBodyBytes) return jsonNoStore({}, 413);
  const reader = request.body?.getReader();
  if (!reader) return jsonNoStore({}, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBodyBytes) {
        await reader.cancel();
        return jsonNoStore({}, 413);
      }
      chunks.push(value);
    }
    const input = bodySchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    return input.success ? input.data : jsonNoStore({}, 400);
  } catch {
    return jsonNoStore({}, 400);
  } finally {
    reader.releaseLock();
  }
}

async function worker(path: string, body: unknown) {
  const {url, headers} = pythonEndpoint(process.env, path);
  const r = await fetch(url,{method:"POST", headers, body:JSON.stringify(body), redirect:"error",
    cache:"no-store", signal:AbortSignal.timeout(15000)});
  if (!r.ok) throw new Error("Validation unavailable");
  return r.json();
}

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) return jsonNoStore({},403);
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status !== "allowed" || !access.context.actorUuid) return jsonNoStore({}, access.status === "unavailable" ? 503 : 401);
  const {id} = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonNoStore({},404);
  const input = await readAnswers(request);
  if (input instanceof Response) return input;
  const where = {fileUuid:id,file:{createdByUuid:access.context.actorUuid,deletingAt:null}};
  try {
    const db = getDatabase();
    const row = await db.formUpload.findFirst({where,select:{processingJson:true, modifiedAt:true}});
    if (!row?.processingJson) return jsonNoStore({},404);
    const result = formProcessingResult.safeParse(row.processingJson).data;
    if (result?.mode !== "pipeline" || row.modifiedAt.getTime() !== input.revision) return jsonNoStore({},409);
    if (needsRuleAnalysis(result)) return jsonNoStore({}, 409);
    if (input.analyzedAt !== result.processed_at || (result.answer_revision ?? null) !== input.answerVersion ||
      (result.form_ir?.extended?.candidates.filter(c=>c.resolution).length ?? 0) !== input.reviewCount) return jsonNoStore({},409);
    const fields = editorFields(result);
    const values: AnswerValues = {};
    for (const {field} of fields) {
      const value = field.readOnly ? result.source_answers?.[field.id] ?? (field.defaultValueType ? undefined : field.defaultValue) : input.answers[field.id];
      if (value !== undefined) values[field.id] = typeof value === "string"
        ? (isCountryField(field) ? countryCode(value) ?? value.trim() : value.trim()) : value;
    }
    const profile = result.form_ir?.extended;
    let active = activeFields(result,values,fields);
    const checks: CheckResult[] = [];
    const byKey = new Map(fields.map(item => [item.field.techName,item.field]));
    if (profile) {
      const answers = Object.fromEntries(fields.filter(({field}) => values[field.id] !== undefined).map(({field}) => [field.techName,values[field.id]]));
      if (answers.country === "PL") answers.country = "Polska";
      const response = profileState.parse(await worker("/v1/forms/profiles/evaluate", {
        profileId:profile.profileId,version:profile.version,asOf:profile.asOf,path:"APPLICATION",answers,
        acceptedEditorialFields:profile.candidates.filter(c=>c.canIncludeAfterReview && c.resolution?.outcome==="ACCEPT").map(c=>c.key)
      }));
      active = fields.filter(({field}) => (response.states[field.techName] === "TRUE" ||
        (dictionaryProfile.helpers.some(h=>h.id===field.id) && answers.country==="Polska")) &&
        !(field.techName==="street_code" && answers.has_street==="false"));
      for (const [key,code] of Object.entries(response.errors)) {
        const field = byKey.get(key);
        if (!field) continue;
        const answer = values[field.id];
        // The dictionary profile dispatches international accounts to an IBAN validator below.
        if (key === "bank_account" && code === "pl_bank_account" && typeof answer === "string" && /^[A-Z]{2}/i.test(answer)) continue;
        const validatorId = code === "invalid_tax_identifier" && (key === "pesel" || key === "nip")
          ? dictionaryProfile.fieldValidators[key] : code;
        checks.push({field:field.id,validatorId,status:code.startsWith("review_") ? "UNVERIFIED" : "INVALID"});
      }
    }
    const countryField = active.find(({field})=>field.dictionaryName==="Kraje" || field.techName==="country");
    const countryInput = countryField && values[countryField.field.id];
    const country = countryInput === "Polska" ? "PL" : typeof countryInput === "string" ? countryInput : undefined;
    const batch: {field:string;validatorId:string;value:string | Record<string,string|boolean>;country?:string}[] = [];
    const accepted: AnswerValues = {};
    if (input.prefillSelf) {
      const mode = byKey.get("reprezentacja_osoby");
      if (input.save || result.form_ir?.procedure.documentId !== "D04" || !mode ||
          !active.some(item => item.field.id === mode.id) || values[mode.id] !== "Osobiście") return jsonNoStore({}, 422);
      const account = await db.user.findUnique({where:{uuid:access.context.actorUuid},select:{keycloakUuid:true}});
      if (!account?.keycloakUuid) return jsonNoStore({},503);
      const person = await getIdentityDirectory().byUuid(account.keycloakUuid);
      if (!person || person.keycloakUuid !== account.keycloakUuid) return jsonNoStore({},503);
      const filled: AnswerValues = {};
      const allowed = new Map([["wnioskodawca_imie", person.firstName], ["wnioskodawca_nazwisko", person.lastName],
        ["email", person.emailVerified ? person.email : undefined]]);
      for (const {field} of active) {
        const value = allowed.get(field.techName);
        if (value && !field.readOnly && !values[field.id]?.length) filled[field.id] = value;
      }
      return jsonNoStore({filled});
    }
    for (const item of active) {
      const {field, required} = item;
      if (field.readOnly) continue;
      const value = values[field.id];
      if (!value?.length) {
        if (required) checks.push({field:field.id,validatorId:"common.required.v1",status:"INVALID"});
        continue;
      }
      const multi = field.type === "CHECKBOX";
      const options = new Set(field.options.map(o => o.id));
      if ((Array.isArray(value) && !multi) || (options.size && !(Array.isArray(value)?value:[value]).every(v=>options.has(v))) ||
          (field.type === "CONSENT_SECTION" && value !== "true")) {
        checks.push({field:field.id,validatorId:"common.enum.v1",status:"INVALID"});
        continue;
      }
      accepted[field.id] = value;
      if (typeof value !== "string") continue;
      if (isCountryField(field)) {
        if (!countryCode(value)) checks.push({field:field.id, validatorId:"common.enum.v1", status:"INVALID"});
        continue;
      }
      const bindings: Record<string,string> = dictionaryProfile.fieldValidators;
      let validatorId = (profile && bindings[field.techName]) || validatorFor(item,value);
      if (profile && field.techName === "bank_account") {
        validatorId = /^[A-Z]{2}/i.test(value) ? "international.iban.v1" : "pl.nrb_bank.nbp.v1";
      }
      if (validatorId) batch.push({field:field.id,validatorId,value,country});
    }
    const groups = addressGroups(result, active, values).filter(group => {
      if (!group.awaitingCountry) return true;
      if (Object.values(group.values).some(Boolean) && group.countryId) {
        checks.push({field:group.countryId,validatorId:"common.required.v1",status:"INVALID"});
      }
      return false;
    });
    const choices: AddressChoices = {};
    const canonical: Record<string,string> = {};
    const geographySchema = z.object({checks:workerChecks, choices:z.record(z.uuid(), z.array(z.tuple([z.string(),z.string()]))),
      canonical:z.record(z.uuid(),z.string()).optional()});
    for (let i = 0; i < groups.length; i += 10) {
      const geography = geographySchema.parse(await worker("/v1/forms/addresses/choices", {
        groups:groups.slice(i,i+10).map(({fields,values}) => ({fields,values})),
      }));
      Object.assign(choices, geography.choices);
      Object.assign(canonical, geography.canonical);
      checks.push(...geography.checks);
    }
    for (const [id,code] of Object.entries(canonical)) if (id in accepted) accepted[id] = code;
    if (profile && country === "PL") {
      const address: Record<string,string|boolean> = {countryCode:"PL"};
      let anchor: string | undefined;
      for (const [property,key] of Object.entries(dictionaryProfile.address.objectFromFields)) {
        const field = byKey.get(key);
        const value = field && accepted[field.id];
        if (!field || typeof value !== "string" || !value || property==="countryCode") continue;
        address[property] = property === "hasStreet" ? value === "true" : value;
        anchor ??= field.id;
      }
      const postal = byKey.get("postal_code");
      if (postal && accepted[postal.id]) anchor = postal.id;
      if (anchor) batch.push({field:anchor,validatorId:dictionaryProfile.address.validatorId,value:address});
    }
    if (result.form_ir?.procedure.documentId === "D04") {
      const number = byKey.get("numer_dzialki"), precinct = byKey.get("obreb"), municipality = byKey.get("budynek_gmina");
      if (number && precinct && (accepted[number.id] || accepted[precinct.id])) {
        const parcel = {number:String(accepted[number.id] ?? ""), precinct:String(accepted[precinct.id] ?? ""),
          municipality:String(municipality ? accepted[municipality.id] ?? "" : "")};
        batch.push({field:number.id,validatorId:"pl.parcel.egib",value:parcel});
      }
    }
    if (batch.length) checks.push(...workerChecks.parse(await worker("/v1/forms/answers/validate",{checks:batch})));
    const feedback = {checks,active:active.map(i=>i.field.id),choices,canonical};
    if (!input.save) return jsonNoStore(feedback);
    if (checks.some(c => c.status === "INVALID")) return jsonNoStore(feedback,422);
    const saved = await db.formUpload.updateMany({where:{...where,modifiedAt:row.modifiedAt,processingJson:{equals:row.processingJson}},
      data:{processingJson:{...result,reviewed_answers:accepted,answer_revision:crypto.randomUUID()}}});
    return saved.count ? jsonNoStore(feedback) : jsonNoStore({},409);
  } catch {
    return jsonNoStore({},503);
  }
}
