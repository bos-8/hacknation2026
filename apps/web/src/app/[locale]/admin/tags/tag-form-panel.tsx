"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Throbber } from "@/ui/basic";
import { PushAside } from "@/ui/components/aside";
import { useNotifications } from "@/ui/components/notification-provider";
import { productFormStyles as styles } from "@/ui/components/styles";
import { DEFAULT_TAG_COLOR, tagColorSchema, tagInputSchema, tagTextColor, type TagResult, type TagRow } from "@/schemas/tag";
import { submitTag } from "./actions";

const presets = ["#64748B", "#EF4444", "#F97316", "#EAB308", "#22C55E", "#06B6D4", "#3B82F6", "#A855F7"];

export function TagFormPanel({ tag, onClose, onSaved }: { tag?: TagRow; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("common.admin.tags");
  const id = useId();
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(tag?.color ?? DEFAULT_TAG_COLOR);
  const [error, setError] = useState<Exclude<TagResult["status"], "ok"> | null>(null);
  const [pending, startTransition] = useTransition();
  const { pushNotification } = useNotifications();
  const validColor = tagColorSchema.safeParse(color).data ?? DEFAULT_TAG_COLOR;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!tagInputSchema.safeParse({ name, color }).success) { setError("invalid"); return; }
    const form = new FormData(event.currentTarget);
    if (tag) { form.set("uuid", tag.uuid); form.set("expectedUpdatedAt", tag.updatedAt.toISOString()); }
    const notification = pushNotification({ mode: "info", brief: true, pending: true, message: t("saving") });
    setError(null);
    startTransition(async () => {
      let result: TagResult;
      try { result = await submitTag(form); } catch { result = { status: "failed" }; }
      pushNotification({ id: notification, mode: result.status === "ok" ? "success" : "error", brief: true,
        message: t(result.status === "ok" ? "saved" : `errors.${result.status}`) });
      if (result.status === "ok") { onSaved(); onClose(); } else setError(result.status);
    });
  }
  return <PushAside id="tag-form-panel" open title={t(tag ? "editTag" : "addTag")} onClose={onClose} disableClose={pending} defaultWidth={420}
    footer={<div className={styles.footer}><Button size="sm" disabled={pending} onClick={onClose}>{t("cancel")}</Button>
      <Button size="sm" type="submit" form={id} tone="success-outline" disabled={pending}>{pending ? <Throbber size="sm" label={t("saving")} /> : t("save")}</Button></div>}>
    <form id={id} onSubmit={submit} className={styles.form}>
      <label className={styles.field}>{t("name")} *<Input name="name" required maxLength={100} value={name} disabled={pending} onChange={event => setName(event.target.value)} /></label>
      <fieldset className="space-y-3" disabled={pending}><legend className="mb-2 text-sm font-medium">{t("color")}</legend>
        <div className="flex items-center gap-3"><Input type="color" aria-label={t("colorPicker")} value={validColor} className="h-10 w-14 shrink-0 cursor-pointer p-1"
          onChange={event => setColor(event.target.value.toUpperCase())} />
          <label className={`${styles.field} flex-1`}>{t("hex")}<Input name="color" value={color} required maxLength={7} pattern="#[0-9A-Fa-f]{6}"
            onChange={event => setColor(event.target.value)} aria-invalid={!tagColorSchema.safeParse(color).success || undefined} /></label></div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("palette")}>{presets.map(value => <button key={value} type="button" aria-label={t("chooseColor", { color: value })}
          aria-pressed={validColor === value} onClick={() => setColor(value)} className="size-7 cursor-pointer rounded-full border border-border outline-offset-2 aria-pressed:outline-2 focus-visible:outline-2 focus-visible:outline-ring"
          style={{ backgroundColor: value }} />)}</div>
      </fieldset>
      <div className={styles.field}><span className={styles.label}>{t("preview")}</span><span className="w-fit max-w-full rounded-full px-3 py-1 text-sm font-medium wrap-anywhere"
        style={{ backgroundColor: validColor, color: tagTextColor(validColor) }}>{name.trim() || t("sampleTag")}</span></div>
      {error && <p role="alert" className="text-sm text-error">{t(`errors.${error}`)}</p>}
    </form>
  </PushAside>;
}
