"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { activeFields, addressGroups, editorFields, initialAnswers, isAddressCountry, isCountryField, type Feedback, type Generated } from "@/schemas/answer-editor";
import { countries } from "@/schemas/countries";
import type { AnswerValues } from "@/schemas/form-upload";
import { Button } from "@/ui/basic";

function plainText(html: string) {
  return html.replace(/<br\s*\/?\s*>|<\/(?:p|li|div)>/gi,"\n").replace(/<[^>]*>/g,"").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").trim();
}

function errorMessage(rule: string) {
  if (rule.includes("pesel")) return "pesel";
  if (rule.includes("nip")) return "nip";
  if (rule === "pl.regon.v1") return "regon";
  if (rule === "pl.krs_format.v1") return "krs";
  if (rule === "international.e164_format.v1") return "phone";
  if (rule.includes("email")) return "email";
  if (rule.includes("postal_format")) return "postal";
  if (rule === "pl.address.prg.v1") return "address";
  if (rule === "teryt.parent") return "territory";
  if (rule === "pl.parcel.egib") return "parcel";
  if (rule.includes("money") || rule==="positive_pln") return "amount";
  if (rule.includes("iso_date") || rule==="invalid_date") return "date";
  if (rule.includes("nrb") || rule.includes("iban") || rule==="pl_bank_account") return "account";
  if (rule==="common.required.v1") return "required";
  if (rule==="common.enum.v1" || rule==="option_not_allowed") return "option";
  return "invalid";
}

export function AnswerEditor({id, revision, result}: {id:string; revision:number; result:Generated}) {
  const t = useTranslations("forms.answers");
  const countryOptions = countries[useLocale() === "pl" ? "pl" : "en"];
  const router = useRouter();
  const prefix = useId();
  const fields = useMemo(() => editorFields(result),[result]);
  const tableCells = useMemo(() => new Map(result.field_locations.flatMap(location => {
    const region = location.input.find(input => input.cell);
    return region?.cell ? [[location.field_id, {page: region.page, ...region.cell}] as const] : [];
  })), [result.field_locations]);
  const [values, setValues] = useState(() => initialAnswers(result));
  const addressFields = addressGroups(result, fields, values);
  const territoryIds = new Set(addressFields.flatMap(group => Object.values(group.fields)));
  const awaitingCountry = new Set(addressFields.filter(group => group.awaitingCountry).flatMap(group => Object.values(group.fields)));
  const [feedback, setFeedback] = useState<Feedback>();
  const [state, setState] = useState<"checking"|"ready"|"saving"|"saved"|"failed"|"conflict">("checking");
  const [attempt, setAttempt] = useState(0);
  const [prefillMessage, setPrefillMessage] = useState<"filled"|"empty"|"prefillFailed">();
  const url = `/api/v1/forms/${id}/answers`;
  const analyzedAt=result.processed_at, answerVersion=result.answer_revision??null;
  const reviewCount=result.form_ir?.extended?.candidates.filter(c=>c.resolution).length??0;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({answers:values,revision,analyzedAt,answerVersion,reviewCount,save:false}),signal:controller.signal});
        if (controller.signal.aborted) return;
        if (!r.ok) {setState(r.status === 409?"conflict":"failed");return;}
        const next = await r.json() as Feedback;
        if (!controller.signal.aborted) {setFeedback(next); setState("ready");}
      } catch {if (!controller.signal.aborted) setState("failed");}
    },160);
    return () => {clearTimeout(timer); controller.abort();};
  },[values,url,revision,attempt,analyzedAt,answerVersion,reviewCount]);

  function change(key:string,value:AnswerValues[string]) {
    setState("checking");
    setPrefillMessage(undefined);
    const changed = fields.find(({field}) => field.id === key);
    const dependents = new Set<string>();
    for (const group of addressFields) {
      const ids = Object.values(group.fields);
      const index = ids.indexOf(key);
      if (index >= 0) ids.slice(index + 1).forEach(id => dependents.add(id));
      if (changed && isAddressCountry(changed.field) && fields.some(item => item.sectionId === changed.sectionId && item.field.id === ids[0])) {
        ids.forEach(id => dependents.add(id));
      }
    }
    setFeedback(old => {
      if (!old) return old;
      const choices = {...old.choices}, canonical = {...old.canonical};
      delete canonical[key];
      for (const id of dependents) { delete choices[id]; delete canonical[id]; }
      return {...old, choices, canonical};
    });
    setValues(old => {
      const next = {...old,[key]:value};
      for (const id of dependents) delete next[id];
      return next;
    });
  }
  async function prefill() {
    setState("saving");
    try {
      const response = await fetch(url, {method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({answers:values,revision,analyzedAt,answerVersion,reviewCount,save:false,prefillSelf:true})});
      if (!response.ok) throw new Error();
      const {filled} = await response.json() as {filled: AnswerValues};
      setPrefillMessage(Object.keys(filled).length ? "filled" : "empty");
      setState("checking");
      setValues(old => ({...old,...filled}));
    } catch {setPrefillMessage("prefillFailed");setState("ready");}
  }
  async function save() {
    setState("saving");
    try {
      const r = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({answers:values,revision,analyzedAt,answerVersion,reviewCount,save:true})});
      if (r.ok) {setState("saved");router.refresh();}
      else if (r.status===422) {setFeedback(await r.json());setState("ready");}
      else setState(r.status===409?"conflict":"failed");
    } catch {setState("failed");}
  }

  const active = new Set(feedback?.active);
  const self = fields.find(({field}) => field.techName === "reprezentacja_osoby")?.field;
  const offerPrefill = result.form_ir?.procedure.documentId === "D04" && self && active.has(self.id) && values[self.id] === "Osobiście";
  const errors = new Set(feedback?.checks.filter(c => c.status==="INVALID").map(c=>c.field));
  const layout = useMemo(() => editorFields(result, true), [result]);
  const groups = Map.groupBy(activeFields(result, values, layout), item => item.sectionId);
  const [tabId, setTabId] = useState(result.draft.tabs[0]?.id);
  const tab = result.draft.tabs.find(item => item.id === tabId) ?? result.draft.tabs[0];
  if (!tab) return <p role="status">{t("noFields")}</p>;
  return <section aria-label={t("title")} className="min-w-0 p-4">
    <h2 className="text-lg font-semibold">{result.draft.title}</h2>
    <nav aria-label={t("title")} className="my-3 flex flex-wrap gap-2">
      {result.draft.tabs.map(item => <button key={item.id} type="button" aria-current={item.id===tab.id ? "page" : undefined}
        onClick={() => setTabId(item.id)} className="rounded-md border border-panel-border px-3 py-1.5 aria-current:bg-primary aria-current:text-white">{item.title}</button>)}
    </nav>
    <p role="status" className="my-2 text-sm">{state==="ready" ? t("errors",{count:errors.size}) : t(state)}</p>
    {offerPrefill && <Button type="button" size="sm" tone="main-outline" disabled={state !== "ready"} onClick={prefill}>{t("prefill")}</Button>}
    {prefillMessage && <p role="status" className="text-sm">{t(prefillMessage)}</p>}
    <form noValidate onSubmit={event => {event.preventDefault(); if (state==="ready" && !errors.size) void save();}}>
      {tab.questions.toSorted((a,b) => a.y-b.y || a.x-b.x).map(({field:section}) => {
        const items = groups.get(section.id);
        if (!items?.length) return null;
        return <fieldset key={section.id} className="my-4 grid gap-3 border-t border-panel-border pt-2 sm:grid-cols-3">
        <legend className="pr-2 font-medium">{section.title}</legend>
        {plainText(section.description) && <p className="col-span-full whitespace-pre-line">{plainText(section.description)}</p>}
        {items.map(({field,required,x,cols}) => {
          const width = Math.min(3,cols);
          const placement = ["", "sm:col-span-1", "sm:col-span-2", "sm:col-span-3"][width] + " " +
            ["sm:col-start-1","sm:col-start-2","sm:col-start-3"][Math.min(3-width,x)];
          if (["INFO_SECTION","TEXT_BLOCK"].includes(field.type)) return <div key={field.id} className={placement}>
            {field.title && <strong>{field.title}</strong>}<p className="whitespace-pre-line">{plainText(field.description)}</p></div>;
          if (field.type === "FILE_UPLOADER") return <label key={field.id} className={placement}>{field.title}
            <input type="file" disabled className="mt-1 block w-full" /><small>{t("attachmentPreview")}</small></label>;
          const key=field.id, htmlId=prefix+key, value=values[key] ?? "";
          const invalid=errors.has(key);
          const issue=feedback?.checks.find(c=>c.field===key && (invalid?c.status==="INVALID":["UNAVAILABLE","UNVERIFIED"].includes(c.status)));
          const props={id:htmlId,disabled:state==="saving"||field.readOnly,"aria-required":required,
            "aria-invalid":invalid,"aria-describedby":issue?htmlId+"-issue":undefined,
            className:`mt-1 block w-full rounded-md border px-3 py-2 ${invalid?"border-red-600 bg-red-500/10":"border-panel-border bg-panel"}`};
          const scalar=feedback?.canonical?.[key] ?? (typeof value==="string"?value:value[0]??"");
          const multi=field.type==="CHECKBOX";
          const choices = isCountryField(field) ? countryOptions : territoryIds.has(key) ? feedback?.choices?.[key] ?? [] : undefined;
          const options = choices ? choices.map(([id,name])=>({id,name})) : field.options;
          const title = field.title.trim() || field.consentSectionConfig?.consents[0]?.description.replace(/<[^>]+>/g,"").trim()
            || field.techName.replaceAll("_"," ");
          const cell = tableCells.get(key);
          const label = cell ? <>{title} <span className="text-xs font-normal">({t("tableCell",cell)})</span></> : title;
          const marked = Array.isArray(value) ? value : value ? [value] : [];
          const grouped = !choices && options.length > 0 && (field.type === "RADIO" || multi);
          return <div key={key} className={placement}>
            {grouped ? <fieldset disabled={props.disabled} aria-invalid={invalid} aria-describedby={props["aria-describedby"]}
              className={invalid ? "rounded-md border border-red-600 bg-red-500/10 px-3 pb-2" : undefined}>
              <legend className="text-sm font-medium">{label}{required && " *"}</legend>
              {options.map(option => <label key={option.id} className="mt-1 flex items-center gap-2 text-sm">
                <input type={multi ? "checkbox" : "radio"} name={htmlId} value={option.id} checked={marked.includes(option.id)}
                  onChange={e => change(key, multi ? (e.target.checked ? [...marked, option.id] : marked.filter(v=>v!==option.id)) : option.id)} />
                {option.name}
              </label>)}
            </fieldset> : <>
            <label htmlFor={htmlId} className="block text-sm font-medium">{label}{required && " *"}</label>
            {choices || options.length ? <select {...props} disabled={props.disabled || awaitingCountry.has(key) || (!!choices && !choices.length && !scalar)}
              multiple={multi} value={multi ? (Array.isArray(value)?value:value?[value]:[]) : scalar}
              onChange={e=>change(key,multi?Array.from(e.target.selectedOptions,o=>o.value):e.target.value)}>
              {!multi && <option value="">{t(awaitingCountry.has(key) ? "chooseCountryFirst" : "choose")}</option>}
              {scalar && !options.some(o=>o.id===scalar) && <option value={scalar}>{scalar}</option>}
              {options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
              : field.type==="CONSENT_SECTION" ? <input {...props} type="checkbox" className={invalid ? "accent-primary outline-2 outline-red-600" : "accent-primary"} checked={value==="true"} onChange={e=>change(key,e.target.checked?"true":"")}/>
              : field.type==="TEXTAREA" ? <textarea {...props} maxLength={4000} value={scalar} onChange={e=>change(key,e.target.value)}/>
              : <input {...props} type={field.type==="DATEPICKER" && (!scalar || /^\d{4}-\d{2}-\d{2}$/.test(scalar)) ? "date" : "text"} autoComplete="off" maxLength={4000} inputMode={field.type==="NUMBER"?"decimal":"text"} value={scalar} onChange={e=>change(key,e.target.value)}/>}</>}
            {plainText(field.description) && field.type !== "CONSENT_SECTION" && <p className="mt-1 whitespace-pre-line text-sm">{plainText(field.description)}</p>}
            {issue && <p id={htmlId+"-issue"} className={invalid?"mt-1 text-sm text-red-700 dark:text-red-400":"mt-1 text-sm text-amber-700 dark:text-amber-400"}>
              {issue.status!=="INVALID" ? t("unverified",{rule:issue.validatorId}) : t(errorMessage(issue.validatorId),{rule:issue.validatorId})}
            </p>}
          </div>;
        })}
      </fieldset>; })}
      <div className="flex gap-2"><Button type="submit" size="sm" tone="main-outline" disabled={state!=="ready" || errors.size>0}>{t("save")}</Button>
        {state==="failed" && <Button type="button" size="sm" onClick={()=>{setState("checking");setAttempt(n=>n+1);}}>{t("retry")}</Button>}
        {state==="conflict" && <Button type="button" size="sm" onClick={()=>window.location.reload()}>{t("reload")}</Button>}</div>
    </form>
  </section>;
}
