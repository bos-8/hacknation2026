"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { BoxSeam, Plus, Upload, X } from "react-bootstrap-icons";
import { getPathname, Link, usePathname, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/schemas/i18n";
import { PRODUCT_CURRENCIES, PRODUCT_IMAGE_MAX_BYTES, parseProductQuery, productCreateSchema, productEditFieldsSchema, productUrlParams, type ProductCreateField, type ProductCreateResult, type ProductEditResult, type ProductQuery, type ProductRow } from "@/schemas/product";
import { Button, Input, Select, Textarea, Throbber, Tooltip } from "@/ui/basic";
import { basicStyles, buttonTones, cx } from "@/ui/basic/styles";
import { PushAside } from "@/ui/components/aside";
import { useNotifications } from "@/ui/components/notification-provider";
import { productFormStyles as styles } from "@/ui/components/styles";
import { addProduct, saveProduct } from "./actions";
import { useTableQuery } from "@/ui/components/table-query";
import { AsideSection } from "@/ui/components/aside-section";
import { PrivateImagePreview } from "@/ui/components/private-image-preview";
import { API_ROUTES } from "@/config/api-routes";

export function ProductCreateButton({ locale, query }: { locale: AppLocale; query: ProductQuery }) {
  const t = useTranslations("common.admin.products");
  const pathname = usePathname();
  const href = { pathname: "/admin/products/create" as const, query: productUrlParams(query) };
  const active = pathname?.endsWith("/admin/products/create");
  return <Tooltip content={t("addProduct")} placement="bottom"><Link href={href} locale={locale} prefetch={false}
    aria-expanded={Boolean(active)} aria-controls="product-create-panel" aria-label={t("addProduct")}
    className={cx(basicStyles.button, buttonTones["main-outline"], "h-7 min-h-7 px-2 py-0 text-xs")}
    onClick={event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (!active) window.history.pushState(null, "", getPathname({ locale, href }));
    }}><Plus aria-hidden="true" className="size-3.5" />{t("addProduct")}</Link></Tooltip>;
}

export function ProductFormAside({ locale, query, product, onClose, onSaved }: { locale: AppLocale; query?: ProductQuery; product?: ProductRow; onClose?: () => void; onSaved?: () => void }) {
  const t = useTranslations("common.admin.products");
  const router = useRouter();
  const { pushNotification } = useNotifications();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<Exclude<ProductCreateResult["status"] | ProductEditResult["status"], "ok"> | null>(null);
  const [invalid, setInvalid] = useState<ProductCreateField[]>([]);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  function close() {
    if (pending) return;
    if (onClose) onClose();
    else if (query) window.history.replaceState(null, "", getPathname({ locale, href: { pathname: "/admin/products", query: productUrlParams(query) } }));
  }

  function selectImage(file: File | null) {
    if (pending) return;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setPreview(null); setImage(null); setError(null);
    if (!file) return;
    if (file.size > PRODUCT_IMAGE_MAX_BYTES) { setError("tooLarge"); return; }
    if (!file.size || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("invalidImage"); return; }
    previewRef.current = URL.createObjectURL(file);
    setPreview(previewRef.current); setImage(file);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    form.delete("image");
    if (image) form.set("image", image);
    const parsed = (product ? productEditFieldsSchema : productCreateSchema).safeParse(Object.fromEntries(form.entries()));
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map(issue => issue.path[0] as ProductCreateField))];
      setInvalid(fields); setError("invalid");
      (formRef.current?.elements.namedItem(fields[0]) as HTMLElement | null)?.focus();
      return;
    }
    setInvalid([]); setError(null);
    if (product) {
      form.set("uuid", product.uuid);
      form.set("expectedUpdatedAt", product.updatedAt.toISOString());
    }
    const id = pushNotification({ id: product ? "product-edit" : "product-create", mode: "info", message: t("savingProduct"), pending: true, brief: true });
    startTransition(async () => {
      let result: ProductCreateResult | ProductEditResult;
      try { result = product ? await saveProduct(form) : await addProduct(form); } catch { result = { status: "failed" }; }
      pushNotification({ id, mode: result.status === "ok" ? "success" : "error", message: t(result.status === "ok" ? product ? "productUpdated" : "productCreated" : `createErrors.${result.status}`), brief: true });
      if (result.status === "ok") {
        if (product) { onSaved?.(); onClose?.(); }
        else if (query) {
          window.history.replaceState(null, "", getPathname({ locale, href: { pathname: "/admin/products", query: productUrlParams(query) } }));
          router.refresh();
        }
      } else {
        setError(result.status);
        if (result.status === "invalid") setInvalid(result.fields ?? []);
        if (result.status === "duplicate") {
          setInvalid(["code"]);
          (formRef.current?.elements.namedItem("code") as HTMLElement | null)?.focus();
        }
      }
    });
  }

  const fieldProps = (name: ProductCreateField) => ({ id: `${formId}-${name}`, name, disabled: pending,
    "aria-invalid": invalid.includes(name) || undefined, "aria-describedby": invalid.includes(name) ? `${formId}-${name}-error` : undefined });
  function fieldError(name: ProductCreateField) {
    return invalid.includes(name) && <span id={`${formId}-${name}-error`} className={styles.error}>{t("invalidField", { field: t(name) })}</span>;
  }

  return <PushAside id={product ? "product-edit-panel" : "product-create-panel"} open onClose={close} disableClose={pending} title={t(product ? "editProduct" : "addProduct")}
    icon={<BoxSeam aria-hidden="true" className="size-4 text-primary" />} defaultWidth={460} aria-busy={pending}
    footer={<div className={styles.footer}>
      <Button size="sm" tone="main-outline" disabled={pending} onClick={close}>{t("cancel")}</Button>
      <Button size="sm" type="submit" form={formId} tone="success-outline" disabled={pending}>
        {pending ? <Throbber size="sm" label={t("savingProduct")} /> : t("saveProduct")}
      </Button>
    </div>}>
    <form ref={formRef} id={formId} onSubmit={submit} className={styles.form}>
      <label className={styles.field}><span className={styles.label}>{t("code")} *</span>
        <Input {...fieldProps("code")} defaultValue={product?.code} required maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,63}" placeholder="PRD-0001" />
        <span className={styles.hint}>{t("codeHint")}</span>{fieldError("code")}
      </label>
      <label className={styles.field}><span className={styles.label}>{t("name")} *</span>
        <Input {...fieldProps("name")} defaultValue={product?.name} required maxLength={255} />{fieldError("name")}
      </label>
      <label className={styles.field}><span className={styles.label}>{t("description")}</span>
        <Textarea {...fieldProps("description")} defaultValue={product?.description ?? ""} maxLength={10000} rows={4} />{fieldError("description")}
      </label>
      <div className={styles.priceRow}>
        <label className={styles.field}><span className={styles.label}>{t("price")} *</span>
          <Input {...fieldProps("price")} defaultValue={product?.price} type="text" inputMode="decimal" required placeholder="0,00" />{fieldError("price")}
        </label>
        <label className={styles.field}><span className={styles.label}>{t("currency")} *</span>
          <Select {...fieldProps("currency")} defaultValue={product?.currency ?? "PLN"}>{PRODUCT_CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}</Select>{fieldError("currency")}
        </label>
      </div>
      {!product && <label className={styles.field}><span className={styles.label}>{t("status")}</span>
        <Select {...fieldProps("status")} defaultValue="active"><option value="active">{t("statuses.active")}</option><option value="inactive">{t("statuses.inactive")}</option></Select>{fieldError("status")}
      </label>}
      <AsideSection title={t("imageOptional")}><div className={styles.field}>
        {product?.imageFileUuid && <p className={styles.hint}>{t("currentImage", { name: product.imageFileName ?? product.imageFileUuid })}</p>}
        {product?.imageFileUuid && !preview && <PrivateImagePreview key={`${product.uuid}:${product.updatedAt.toISOString()}`}
          imageUrl={API_ROUTES.productImage.replace("{uuid}", encodeURIComponent(product.uuid))} name={product.name} />}
        <label className={styles.upload}>
          <input type="file" name="image" accept="image/jpeg,image/png,image/webp" disabled={pending} className="sr-only"
            aria-label={t(product?.imageFileUuid ? "replaceImage" : "chooseImage")} onChange={event => { selectImage(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} />
          {preview ? <Image src={preview} alt={t("imagePreview")} width={300} height={190} unoptimized className={styles.preview} /> : <Upload aria-hidden="true" className="size-6 text-primary" />}
          <span className="break-all">{image?.name ?? t(product?.imageFileUuid ? "replaceImage" : "chooseImage")}</span>
          <span className={styles.hint}>{t("imageLimit", { mib: PRODUCT_IMAGE_MAX_BYTES / 1024 / 1024 })}</span>
        </label>
        {image && <Button size="sm" tone="danger-outline" disabled={pending} onClick={() => selectImage(null)}><X aria-hidden="true" className="size-4" />{t("removeImage")}</Button>}
      </div></AsideSection>
      {error && <p role="alert" className="text-sm text-error">{t(`createErrors.${error}`)}</p>}
    </form>
  </PushAside>;
}

export function ProductCreatePanel(props: { locale: AppLocale; query: ProductQuery }) {
  const pathname = usePathname();
  const query = useTableQuery(props.query, parseProductQuery);
  return pathname?.endsWith("/admin/products/create") ? <ProductFormAside locale={props.locale} query={query} /> : null;
}
