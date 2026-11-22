import type { AnswerValues, FormProcessingResult } from "./form-upload";
import dictionaryProfile from "./address-validation.json";
import { countryCode } from "./countries";

export type Generated = Extract<FormProcessingResult, {mode: "pipeline"}>;
export type AnswerField = Generated["draft"]["tabs"][number]["questions"][number]["field"]["repeatingSectionGrid"][number]["field"];
export type CheckResult = {field: string; validatorId: string; status: "INVALID" | "UNAVAILABLE" | "UNVERIFIED" | "VALID" | "NOT_APPLICABLE"};
export type AddressChoices = Record<string, [string, string][]>;
export type Feedback = {checks: CheckResult[]; active: string[]; choices?: AddressChoices; canonical?: Record<string,string>};
type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Obj : {};
const types = new Set(["TEXT_FIELD","TEXTAREA","NUMBER","DATEPICKER","RADIO","SELECT","CHECKBOX","CONSENT_SECTION"]);

export function needsRuleAnalysis(result: Generated) {
  return !result.form_ir && result.draft.tabs.some(tab => tab.questions.some(({field}) =>
    field.states?.length || field.repeatingSectionGrid.some(child => child.field.states?.length)));
}

export function editorFields(result: Generated, includePresentation = false) {
  const nodes = new Map<string, {config: Obj; type: string; required: boolean; ancestors: string[]}>();
  function walk(value: unknown, ancestors: string[]) {
    const node = obj(value);
    if (typeof node.id !== "string") return;
    const ids = [...ancestors, node.id];
    nodes.set(node.id, {config: obj(node.config), type: String(node.type), required: obj(node.state).required === true, ancestors: ids});
    if (Array.isArray(node.children)) node.children.forEach(child => walk(child, ids));
  }
  walk(result.form_ir?.form, []);
  const fields = result.draft.tabs.flatMap(tab => tab.questions.flatMap(({field: section}) =>
    section.repeatingSectionGrid.filter(({field}) => includePresentation || types.has(field.type)).toSorted((a,b) => a.y-b.y || a.x-b.x).map(({field,x,cols}) => {
      const node = nodes.get("f." + field.id);
      return {field, x, cols, tab: tab.title, section: section.title, sectionId: section.id, ancestors: node?.ancestors ?? [], semantic: String(node?.config.semanticType ?? node?.type ?? ""),
        required: node?.required || field.validation.includes("REQUIRED") || Boolean(field.consentSectionConfig?.consents.some(c => c.required))};
    })));
  const address = fields.find(item => item.field.techName === "municipality");
  if (!includePresentation && address && result.form_ir?.extended?.profileId === "pl.tax.overpayment.local.2026.10.extended") {
    for (const helper of dictionaryProfile.helpers) {
      const toggle = helper.widget === "BOOLEAN";
      fields.push({...address,required:false,semantic:"",field:{
        ...address.field,id:helper.id,techName:helper.key,title:helper.label,type:toggle?"RADIO":"TEXT_FIELD",
        readOnly:false,validation:[],defaultValue:undefined,dictionaryName:undefined,
        options:toggle?[{id:"true",name:"Tak",techName:"yes"},{id:"false",name:"Nie",techName:"no"}]:[],
      }});
    }
  }
  return fields;
}

export function initialAnswers(result: Generated): AnswerValues {
  const answers: AnswerValues = {};
  for (const {field} of editorFields(result)) {
    const literal = field.defaultValueType === "EXTERNAL_SYSTEM" ? undefined : field.defaultValue;
    const observed = result.source_answers?.[field.id];
    const val = field.readOnly ? observed ?? literal : result.reviewed_answers ? result.reviewed_answers[field.id] : observed ?? literal;
    if (val === undefined) continue;
    const option = (s: string) => field.options.find(o => o.id === s || o.name === s)?.id ?? s;
    if (isCountryField(field)) {
      const text = typeof val === "string" ? val : val[0] ?? "";
      answers[field.id] = countryCode(text) ?? text;
    } else {
      answers[field.id] = typeof val === "string" ? option(val) : val.map(option);
    }
  }
  return answers;
}

const levels = ["province", "county", "municipality", "locality", "street"] as const;
const suffixes = ["wojewodztwo", "powiat", "gmina", "miejscowosc", "ulica"];
type TerritoryGroup = {fields: Record<string,string>; values: Record<string,string>; countryId?: string; awaitingCountry?: boolean};
const folded = (s: string) => s.toLowerCase().replaceAll("ł","l").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();

export function isCountryField(field: AnswerField) {
  return field.dictionaryName === "Kraje" || (!field.readOnly && field.type === "TEXT_FIELD" &&
    ["kraj","kraj zamieszkania","kraj urodzenia","panstwo zamieszkania"].includes(folded(field.title)));
}

export function isAddressCountry(field: AnswerField) {
  return isCountryField(field) && ["kraj","kraj zamieszkania","panstwo zamieszkania"].includes(folded(field.title));
}

function addressLevel(field: AnswerField) {
  if (field.readOnly || field.options.length || !["TEXT_FIELD","SELECT"].includes(field.type)) return -1;
  const name = folded(field.dictionaryName ?? field.title).replace(/ (zamieszkania|siedziby)$/, "");
  if (name === "woj") return 0;
  return suffixes.indexOf(name);
}

export function addressGroups(result: Generated, fields: ReturnType<typeof editorFields>, answers: AnswerValues) {
  const byName = new Map(fields.map(({field}) => [field.techName, field.id]));
  const groups: string[][] = [];
  if (result.form_ir?.procedure.documentId === "D04") {
    for (const prefix of ["adres", "skladajacy", "budynek"]) groups.push(suffixes.map(s => prefix + "_" + s));
  } else if (result.form_ir?.extended && ["PL", "Polska"].includes(String(answers[byName.get("country") ?? ""]))) {
    groups.push(["voivodeship_code", "county_code", "municipality", "locality_code", "street_code"]);
  }
  const resolved: TerritoryGroup[] = groups.map(keys => {
    const ids: Record<string,string> = {};
    const values: Record<string,string> = {};
    for (const [index, key] of keys.entries()) {
      const id = byName.get(key);
      if (!id) break;
      if (key === "street_code" && answers[byName.get("has_street") ?? ""] === "false") break;
      ids[levels[index]] = id;
      if (typeof answers[id] === "string") values[levels[index]] = answers[id];
    }
    return {fields: ids, values};
  }).filter(group => Object.keys(group.fields).length > 0);
  const bound = new Set(resolved.flatMap(group => Object.values(group.fields)));
  for (const section of Map.groupBy(fields, item => item.sectionId).values()) {
    if (folded(section[0].section).includes("zagranic")) continue;
    const country = section.find(({field}) => isAddressCountry(field));
    const code = country && countryCode(String(answers[country.field.id] ?? ""));
    if (code && code !== "PL") continue;
    const byLevel = levels.map((_, i) => section.filter(({field}) => !bound.has(field.id) && addressLevel(field) === i));
    for (const province of byLevel[0]) {
      const group: TerritoryGroup = {fields: {province: province.field.id}, values: {},
        countryId: country?.field.id, awaitingCountry: !!country && !code};
      if (byLevel[0].length === 1) {
        for (let i = 1; i < levels.length && byLevel[i].length === 1; i++) group.fields[levels[i]] = byLevel[i][0].field.id;
      }
      for (const [level,id] of Object.entries(group.fields)) {
        const value = answers[id];
        if (typeof value === "string") group.values[level] = value;
      }
      resolved.push(group);
    }
  }
  return resolved;
}

// Only the typed expression tree emitted by the compiler is interpreted here.
export function activeFields(result: Generated, values: AnswerValues, fields: ReturnType<typeof editorFields>) {
  const rules = new Map((result.form_ir?.rules ?? []).map(r => [r.target, r.expression]));
  const byId = new Map(fields.map(f => [f.field.id, f]));
  const active = new Map<string, boolean>();
  function matches(raw: unknown): boolean {
    const expr = obj(raw);
    if (!Array.isArray(expr.args)) return false;
    if (expr.op === "and") return expr.args.every(matches);
    if (expr.op === "or") return expr.args.some(matches);
    const ref = obj(expr.args[0]).path;
    if (typeof ref !== "string" || !ref.startsWith("/f.")) return false;
    const id = ref.slice(3);
    const value = values[id];
    if (!enabled(id) || !value?.length) return false;
    const set = typeof value === "string" ? [value] : value;
    const operand = obj(expr.args[1]).value;
    const field = byId.get(id)?.field;
    const includes = typeof operand === "string" && (field && isCountryField(field)
      ? set.some(v => (countryCode(v) ?? v) === (countryCode(operand) ?? operand)) : set.includes(operand));
    return expr.op === "eq" ? includes : expr.op === "ne" && !includes;
  }
  function enabled(id: string): boolean {
    if (active.has(id)) return active.get(id)!;
    active.set(id, false);
    const f = byId.get(id);
    const yes = !!f && f.ancestors.every(key => !rules.has(key) || matches(rules.get(key)));
    active.set(id, yes);
    return yes;
  }
  return fields.filter(f => enabled(f.field.id));
}

const validators: Record<string, string> = {
  PESEL:"pl.pesel.v1", NIP:"pl.nip.v1", REGON:"pl.regon.v1", KRS:"pl.krs_format.v1", ADE:"pl.ade.v1",
  PHONE:"international.e164_format.v1", EMAIL:"internet.email_basic.v1", DATE:"common.iso_date.v1", CALENDAR_DATE:"common.iso_date.v1",
  MONEY_PLN:"common.money.v1", MONEY:"common.money.v1", DECIMAL:"common.decimal.v1", NUMBER:"common.decimal.v1", INTEGER:"common.decimal.v1",
  ZIP_CODE:"international.postal_format.v1", POSTCODE:"international.postal_format.v1", POSTAL_CODE:"international.postal_format.v1",
  ACCOUNT_PL:"pl.nrb_bank.nbp.v1", BANK_ACCOUNT:"pl.nrb_bank.nbp.v1",
};
const validatorIds = new Set([...Object.values(validators), "international.iban.v1", "pl.nrb.v1"]);
const captionRules: [RegExp, string][] = [
  [/\bpesel\b/, "PESEL"], [/\bnip\b/, "NIP"], [/\bregon\b/, "REGON"], [/\bkrs\b/, "KRS"],
  [/\b(?:e ?mail|emailowy|poczty elektronicznej)\b/, "EMAIL"],
  [/\b(?:telefon|telefonu|tel)\b/, "PHONE"], [/\bkod pocztowy\b/, "POSTAL_CODE"],
  [/\b(?:iban|nrb|numer konta|(?:nr|numer) rachunku)\b/, "BANK_ACCOUNT"],
];

export function validatorFor(item: ReturnType<typeof editorFields>[number], value: string) {
  const {field, semantic} = item;
  const explicit = field.validation.map(v => validatorIds.has(v) ? v : validators[v]).find(Boolean);
  const caption = folded(field.title || field.techName);
  const matches = ["TEXT_FIELD", "NUMBER"].includes(field.type)
    ? captionRules.filter(([pattern]) => pattern.test(caption)) : [];
  // A combined caption such as “Telefon / e-mail” does not specify a single format.
  const inferred = matches.length === 1 ? validators[matches[0][1]] : undefined;
  const specific = ["NUMBER", "INTEGER", "DECIMAL"].includes(semantic) ? undefined : validators[semantic];
  const id = explicit || specific || inferred || validators[semantic] ||
    (field.type === "DATEPICKER" ? validators.DATE : validators[field.type]);
  if (id === "pl.nrb_bank.nbp.v1" && /^[A-Z]{2}/i.test(value)) return "international.iban.v1";
  return id;
}
