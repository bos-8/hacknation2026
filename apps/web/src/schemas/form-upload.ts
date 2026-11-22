import { z } from "zod";
import { formFormats } from "./form-formats.ts";

export const MAX_FORM_BYTES = 20 * 1024 * 1024;

export function formMediaType(name: string) {
  return formFormats.find(format => format.extensions.some(ext => name.toLowerCase().endsWith(ext)))?.mime ?? "application/octet-stream";
}

export const validatedFormFile = z.object({
  status: z.literal("validated"),
  media_type: z.enum(formFormats.map(format => format.mime)),
  size_bytes: z.number().int().positive().max(MAX_FORM_BYTES),
});

const processingBase = z.object({
  status: z.literal("processed"),
  form_id: z.uuid(),
  operation_id: z.uuid().optional(),
  processed_at: z.iso.datetime({ offset: true }),
  file: validatedFormFile,
});

export const answerValues = z.record(z.uuid(), z.union([z.string().max(4000), z.array(z.string().max(4000)).max(100)]));
export type AnswerValues = z.infer<typeof answerValues>;

const draftId = z.string().trim().min(1).max(100);
const draft = z.strictObject({
  title: z.string().trim().min(1).max(250),
  tabs: z.array(z.strictObject({
    id: draftId,
    title: z.string().trim().min(1).max(250),
    fields: z.array(z.strictObject({
      id: draftId, label: z.string().trim().min(1).max(500),
      type: z.string().trim().min(1).max(60), required: z.boolean(),
    })).max(150),
  })).min(1).max(30),
  flow: z.strictObject({ links: z.array(z.strictObject({ source: draftId, target: draftId })).max(200) }),
});

const coiField = z.strictObject({
  id: z.uuid(), type: z.string().min(1), techName: z.string().min(1), title: z.string(),
  description: z.string(), readOnly: z.boolean(), questionOrder: z.number().int().nonnegative(),
  tooltipMessage: z.string(), validation: z.array(z.string()),
  defaultValue: z.union([z.string(), z.array(z.string())]).optional(),
  defaultValueType: z.literal("EXTERNAL_SYSTEM").optional(),
  searchEnabled: z.boolean().optional(),
  dictionaryName: z.string().min(1).optional(),
  consentSectionConfig: z.strictObject({
    consents: z.array(z.strictObject({ description: z.string(), required: z.boolean() })).min(1),
    files: z.array(z.string()),
  }).optional(),
  states: z.array(z.record(z.string(), z.string())).optional(),
  options: z.array(z.strictObject({ id: z.string().min(1), name: z.string(), techName: z.string() })),
});
const coiGrid = z.strictObject({
  x: z.number().int().nonnegative(), y: z.number().int().nonnegative(),
  rows: z.number().int().positive(), cols: z.number().int().positive(),
});
const coiQuestion = coiGrid.extend({
  field: coiField.extend({ repeatingSectionGrid: z.tuple([]) }),
});
const coiForm = z.strictObject({
  title: z.string().min(1).max(255),
  tabs: z.array(z.strictObject({
    id: z.uuid(), title: z.string().min(1), type: z.enum(["MAIN", "FINISH"]),
    questions: z.array(coiGrid.extend({
      field: coiField.extend({ repeatingSectionGrid: z.array(coiQuestion) }),
    })).min(1),
  })).min(2),
  flow: z.strictObject({
    links: z.array(z.strictObject({ id: z.uuid(), source: z.uuid(), target: z.uuid() })).min(1),
  }),
});
const axis = z.number().min(0).max(1);
const region = z.strictObject({
  page: z.number().int().min(1).max(40), bbox: z.tuple([axis, axis, axis, axis]),
  cell: z.strictObject({ row: z.number().int().positive(), column: z.number().int().positive() }).optional(),
}).refine(({ bbox: [x0, y0, x1, y1] }) => x0 < x1 && y0 < y1);
const locations = z.array(z.strictObject({
  field_id: z.uuid(), label: z.array(region).max(6), input: z.array(region).max(6),
}));
const confidences = z.array(z.strictObject({
  field_id: z.uuid(), confidence: axis, ocr_confidence: axis.nullable(),
}));
const irObject = z.record(z.string(), z.json());
const candidateResolution = z.object({
  outcome: z.enum(["ACCEPT", "DECLINE"]), reason: z.string(), actor: z.uuid(), at: z.string(),
});
const semanticCandidate = z.object({
  key: z.string(), label: z.string(), decision: z.enum(["AUTO", "CONDITIONAL", "REVIEW", "REJECT"]),
  reviewReason: z.string().nullable(), legalRuleIds: z.array(z.string()), sourceEvidence: z.array(z.string()),
  included: z.boolean(), canIncludeAfterReview: z.boolean(), resolution: candidateResolution.nullable(),
}).catchall(z.json());
const extendedProfile = z.object({
  mode: z.literal("EXTENDED"), profileId: z.string(), version: z.string(), asOf: z.iso.date(),
  candidates: z.array(semanticCandidate), publicationBlockedBy: z.array(z.string()),
  legalRules: z.array(z.object({id: z.string(), title: z.string(), basis: z.string(), sources: z.array(z.string())}).catchall(z.json())),
  sources: z.array(z.object({sourceId: z.string(), url: z.string().optional()}).catchall(z.json())),
}).catchall(z.json());
export type ExtendedProfile = z.infer<typeof extendedProfile>;
const formIr = z.strictObject({
  schemaVersion: z.literal("1.0.0"),
  procedure: z.strictObject({
    match: z.enum(["reference_sha256", "reference_text", "text_candidate", "unknown"]),
    status: z.enum(["unknown", "review", "multiple", "blocked"]),
    candidates: z.array(z.object({
      id: z.string(), label: z.string(), releaseStatus: z.string(), releaseGates: z.array(z.string()),
    })),
    documentId: z.string().nullable(), sourceSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  }),
  form: irObject.refine(node => node.type === "FORM" && Array.isArray(node.children)),
  rules: z.array(irObject), review: z.array(z.object({ nodeId: z.string(), reason: z.string() })),
  evidence: z.array(irObject), sourceFields: z.array(irObject),
  participantRoles: z.array(z.object({ role: z.string(), evidenceRefs: z.array(z.string()) })).optional(),
  extended: extendedProfile.optional(),
});

export const formProcessingResult = z.discriminatedUnion("mode", [
  processingBase.extend({
    mode: z.literal("bypass"), schema_version: z.literal(1),
    ocr: z.enum(["bypassed", "not_required", "deferred"]), llm: z.literal("bypassed"),
    draft: z.object({ title: z.null(), tabs: z.tuple([]), flow: z.object({ links: z.tuple([]) }) }),
  }),
  processingBase.extend({
    mode: z.literal("eden"), schema_version: z.literal(2),
    ocr: z.enum(["completed", "not_required"]), llm: z.literal("completed"), draft,
  }),
  processingBase.extend({
    mode: z.literal("pipeline"), schema_version: z.literal(3),
    ocr: z.enum(["completed", "not_required"]), llm: z.enum(["completed", "bypassed"]),
    document_content: z.object({
      schema_version: z.literal(1),
      pages: z.array(z.object({page: z.number().int().min(1).max(40), text: z.string(),
        blocks: z.array(z.object({id: z.number().int(), page: z.number().int(),
          kind: z.enum(["text","table","input"]), text: z.string(),
          bbox: z.tuple([z.number(),z.number(),z.number(),z.number()]).nullable().optional(),
          cell: z.object({row:z.number().int(),column:z.number().int()}).nullable().optional(),
          ocr_confidence:z.number().nullable().optional(),
        })),
      })),
    }).nullable().optional(),
    draft: coiForm, field_locations: locations, field_confidences: confidences.optional(),
    source_answers: answerValues.optional(), reviewed_answers: answerValues.optional(), answer_revision:z.uuid().optional(),
    form_ir: formIr.optional(),
  }),
]).refine(result => {
  if (result.mode !== "pipeline") return true;
  const ids = new Set(result.draft.tabs.flatMap(tab => tab.questions.flatMap(
    question => question.field.repeatingSectionGrid.map(item => item.field.id),
  )));
  return result.field_locations.every(location => ids.has(location.field_id))
    && (result.field_confidences ?? []).every(score => ids.has(score.field_id));
}).transform(result => {
  if (result.mode !== "pipeline") return result;
  const fields = result.draft.tabs.flatMap(tab => tab.questions.flatMap(section =>
    section.field.repeatingSectionGrid.map(item => item.field)));
  // Older OCR results used the writing line as the title. Recover the printed
  // caption only when the same value identifies one unambiguous control.
  const controls = new Map<string, typeof fields>();
  for (const field of fields.filter(f => f.type === "TEXT_FIELD")) {
    const key = field.title.replace(/^\s*\/[^/]+\/\s*/, "").trim();
    const matches = controls.get(key) ?? [];
    matches.push(field);
    controls.set(key, matches);
  }
  for (const block of fields.filter(f => f.type === "TEXT_BLOCK")) {
    const lines = block.description.replace(/<[^>]*>/g, "\n").replace(/&nbsp;/g, " ");
    const segments = lines.split(/\/\s*(imię i nazwisko|nazwisko i imię|adres|PESEL|nr telefonu)\s*\//gi);
    for (let i = 1; i < segments.length; i += 2) {
      const value = segments[i - 1].trim().replace(/[.·…_\s]+$/u, "").trim().split("\n").at(-1)?.trim();
      const matches = value && controls.get(value);
      if (!value || !matches || matches.length !== 1) continue;
      const field = matches[0];
      const label = segments[i];
      field.title = label[0].toLocaleUpperCase("pl") + label.slice(1);
      (result.source_answers ??= {})[field.id] ??= value;
      controls.delete(value);
    }
  }
  return result;
});

export type FormProcessingResult = z.infer<typeof formProcessingResult>;

export function exportForm(result: FormProcessingResult, withAnswers = false) {
  if (result.mode === "bypass") return result;
  if (result.mode !== "pipeline" || !withAnswers) return result.draft;
  const values = result.reviewed_answers ?? result.source_answers;
  if (!values) return result.draft;
  const draft = structuredClone(result.draft);
  for (const tab of draft.tabs) {
    for (const section of tab.questions) {
      for (const {field} of section.field.repeatingSectionGrid) {
        if (field.defaultValueType === "EXTERNAL_SYSTEM") continue;
        const answer = field.readOnly ? result.source_answers?.[field.id] : values[field.id];
        if (answer !== undefined) field.defaultValue = answer;
        else if (result.reviewed_answers && !field.readOnly) delete field.defaultValue;
      }
    }
  }
  return draft;
}

export function formatFormResult(result: FormProcessingResult, withAnswers = false) {
  return JSON.stringify(exportForm(result, withAnswers), null, 2);
}

export function isProcessedForm(result: FormProcessingResult | null) {
  return result?.mode === "pipeline";
}

export function hasFormResult(result: FormProcessingResult | null | undefined) {
  return result?.mode === "pipeline" || result?.mode === "eden";
}

export const formAnalysisStage = z.enum([
  "queued", "accepted", "validated", "extracting", "provider_upload", "ocr", "llm", "llm_retry", "validate_result",
]);

export const formAnalysisProgress = z.object({
  stage: formAnalysisStage,
  remaining_ms: z.number().int().nonnegative().max(300_000).nullable().optional(),
  timeout_remaining_ms: z.number().int().nonnegative().max(300_000).nullable().optional(),
});

export type FormAnalysisStage = z.infer<typeof formAnalysisStage>;

export const formAnalysisPercent: Partial<Record<FormAnalysisStage, number>> = {
  queued: 0, accepted: 10, validated: 20, extracting: 30, provider_upload: 30, ocr: 45, validate_result: 95,
};

export const formAnalysisFailure = z.object({
  reason: z.union([
    z.enum(["deadline", "connection", "provider_wait", "network", "invalid_response",
      "output_limit", "model_filter", "invalid_docx", "invalid_spreadsheet", "ocr_failed", "ocr_no_text", "response_too_large",
      "missing_doc_parser", "missing_document_runtime", "document_reader", "document_context", "invalid_response"]),
    z.string().regex(/^http_[345][0-9]{2}$/),
  ]).optional(),
  phase: formAnalysisStage.optional(),
  timeoutSeconds: z.number().int().min(1).max(300).optional(),
});
