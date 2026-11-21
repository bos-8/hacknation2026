import { z } from "zod";
import { formFormats } from "./form-formats";

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
  processed_at: z.iso.datetime({ offset: true }),
  file: validatedFormFile,
});

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
  id: z.uuid(), type: z.string().min(1), techName: z.string().min(1), title: z.string().min(1),
  description: z.string(), readOnly: z.boolean(), questionOrder: z.number().int().positive(),
  tooltipMessage: z.string(), validation: z.array(z.string()),
  defaultValue: z.union([z.string(), z.array(z.string())]).optional(),
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
}).refine(({ bbox: [x0, y0, x1, y1] }) => x0 < x1 && y0 < y1);
const locations = z.array(z.strictObject({
  field_id: z.uuid(), label: z.array(region).max(6), input: z.array(region).max(6),
}));
const confidences = z.array(z.strictObject({
  field_id: z.uuid(), confidence: axis, ocr_confidence: axis.nullable(),
}));

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
    draft: coiForm, field_locations: locations, field_confidences: confidences.optional(),
  }),
]).refine(result => {
  if (result.mode !== "pipeline") return true;
  const ids = new Set(result.draft.tabs.flatMap(tab => tab.questions.flatMap(
    question => question.field.repeatingSectionGrid.map(item => item.field.id),
  )));
  return result.field_locations.every(location => ids.has(location.field_id))
    && (result.field_confidences ?? []).every(score => ids.has(score.field_id));
});

export type FormProcessingResult = z.infer<typeof formProcessingResult>;

export function formatFormResult(result: FormProcessingResult) {
  return JSON.stringify(result.mode === "bypass" ? result : result.draft, null, 2);
}

export function isProcessedForm(result: FormProcessingResult | null) {
  return result?.mode === "pipeline";
}

export function hasFormResult(result: FormProcessingResult | null | undefined) {
  return result?.mode === "pipeline" || result?.mode === "eden";
}

export const formAnalysisStage = z.enum([
  "accepted", "validated", "extracting", "provider_upload", "ocr", "llm", "llm_retry", "validate_result",
]);

export const formAnalysisProgress = z.object({
  stage: formAnalysisStage,
  remaining_ms: z.number().int().nonnegative().max(300_000).nullable().optional(),
  timeout_remaining_ms: z.number().int().nonnegative().max(300_000).nullable().optional(),
});

export type FormAnalysisStage = z.infer<typeof formAnalysisStage>;

export const formAnalysisPercent: Partial<Record<FormAnalysisStage, number>> = {
  accepted: 10, validated: 20, extracting: 30, provider_upload: 30, ocr: 45, validate_result: 95,
};

export const formAnalysisFailure = z.object({
  reason: z.union([
    z.enum(["deadline", "connection", "provider_wait", "network", "invalid_response",
      "output_limit", "model_filter", "invalid_docx", "ocr_failed", "ocr_no_text", "response_too_large",
      "missing_doc_parser", "missing_document_runtime", "document_reader", "document_context", "invalid_response"]),
    z.string().regex(/^http_[345][0-9]{2}$/),
  ]).optional(),
  phase: formAnalysisStage.optional(),
  timeoutSeconds: z.number().int().min(1).max(300).optional(),
});
