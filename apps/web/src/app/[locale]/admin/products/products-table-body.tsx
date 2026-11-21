"use client";

import { useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Image as ImageIcon, ImageFill, InfoCircle, InfoCircleFill, PencilSquare, SlashLg, Trash3 } from "react-bootstrap-icons";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/schemas/i18n";
import { formatProductPrice, type ProductRow, type ProductStatus } from "@/schemas/product";
import { canChangeProductStatus, type ProductTargetStatus } from "@/schemas/product-status";
import { Badge, Button, Checkbox, TableBody, TableCell, TableRow, Throbber, Tooltip, VerticalDivider } from "@/ui/basic";
import { basicStyles, buttonTones, cx } from "@/ui/basic/styles";
import { PushAside } from "@/ui/components/aside";
import { TableLoadingBody } from "@/ui/components/table-loading-body";
import { tableStyles } from "@/ui/components/styles";
import { catalogStatusActions } from "@/ui/components/catalog-status-actions";
import { Popup } from "@/ui/components/popup";
import { useNotifications } from "@/ui/components/notification-provider";
import { changeProductStatus, permanentlyDeleteProduct } from "./actions";
import { ProductFormAside } from "./product-create-panel";
import { ProductImagePreview } from "./product-image-preview";
import { AsideSection } from "@/ui/components/aside-section";
import { ChangeHistory } from "@/ui/components/change-history";

const statusTones = { active: "success", inactive: "neutral", pending_archiving: "warning", archived: "neutral", pending_deletion: "danger", softdelete: "danger" } as const;

export function ProductsTableBody({ products, locale, emptyMessage, errorMessage, loading = false, onChanged }: { products: ProductRow[]; locale: AppLocale; emptyMessage: string; errorMessage?: string; loading?: boolean; onChanged: () => void }) {
  const t = useTranslations("common.admin.products");
  const format = useFormatter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const { pushNotification } = useNotifications();
  const [pending, startTransition] = useTransition();
  const [changingId, setChangingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductRow | null>(null);
  const [changes, setChanges] = useState<Record<string, { status: ProductStatus | "deleted"; sourceUpdatedAt: number }>>({});
  const visibleProducts = products.flatMap(product => {
    const change = changes[product.uuid];
    if (change?.status === "deleted") return [];
    return [{ ...product, status: change && product.updatedAt.getTime() === change.sourceUpdatedAt ? change.status : product.status }];
  });
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = visibleProducts.find(product => product.uuid === activeId);
  function mutate(product: ProductRow, status: ProductTargetStatus | "deleted") {
    if (pending || loading || status !== "deleted" && !canChangeProductStatus(product.status, status)) return;
    setChangingId(product.uuid);
    setDeleteError(false);
    const deleting = status === "deleted";
    const id = pushNotification({ mode: "info", message: t(deleting ? "deleting" : "savingStatus"), brief: true, pending: true });
    startTransition(async () => {
      try {
        const input = { uuid: product.uuid, expectedStatus: product.status, expectedUpdatedAt: product.updatedAt.toISOString() };
        const result = status === "deleted" ? await permanentlyDeleteProduct(input) : await changeProductStatus({ ...input, status });
        if (result.status === "ok") setChanges(previous => ({ ...previous, [product.uuid]: { status, sourceUpdatedAt: product.updatedAt.getTime() } }));
        pushNotification({ id, mode: result.status === "ok" ? "success" : "error",
          message: t(result.status === "ok" ? deleting ? "deleted" : "statusSaved" : deleting && result.status === "failed" ? "deleteFailed" : `statusErrors.${result.status}`), brief: true });
        if (deleting) {
          if (result.status === "failed") setDeleteError(true);
          else setDeleteTarget(null);
        }
        if (result.status === "ok" || result.status === "conflict" || result.status === "denied") onChanged();
      } catch {
        if (deleting) setDeleteError(true);
        pushNotification({ id, mode: "error", message: t(deleting ? "deleteFailed" : "statusErrors.failed"), brief: true });
      }
    });
  }
  const date = (value: Date | null) => value ? format.dateTime(value, { dateStyle: "medium", timeStyle: "short" }) : "—";
  return <>
    {loading && <TableLoadingBody colSpan={9} label={t("loadingData")} />}
    <TableBody hidden={loading} inert={loading} className={tableStyles.dataBody}>
      {errorMessage && <TableRow><TableCell colSpan={9} className="py-8 text-center"><p role="alert" className="text-error">{errorMessage}</p></TableCell></TableRow>}
      {visibleProducts.map(product => {
        const active = activeId === product.uuid;
        const Icon = active ? InfoCircleFill : InfoCircle;
        return <TableRow key={product.uuid} aria-busy={pending && changingId === product.uuid} data-details-active={active ? "true" : undefined} className={active ? "bg-accent/10 hover:bg-accent/15" : undefined}>
          <TableCell><Checkbox name="selectedProduct" value={product.uuid} aria-label={t("selectProduct", { name: product.name })} /></TableCell>
          <TableCell className="whitespace-nowrap font-mono text-xs">{product.code}</TableCell>
          <TableCell className="max-w-xs wrap-anywhere font-medium">{product.name}</TableCell>
          <TableCell className="whitespace-nowrap text-right tabular-nums">{formatProductPrice(product.price, product.currency, locale)}</TableCell>
          <TableCell>{product.currency}</TableCell>
          <TableCell><Badge tone={statusTones[product.status]} className="whitespace-nowrap">{t(`statuses.${product.status}`)}</Badge></TableCell>
          <TableCell>{product.imageFileUuid ? <Tooltip content={t("openImage", { name: product.name })} placement="bottom">
            <Link href={{ pathname: "/admin/files", query: { file: product.imageFileUuid, preview: "image" } }} locale={locale} prefetch={false}
              aria-label={t("openImage", { name: product.name })} className={cx(basicStyles.button, buttonTones["main-outline"], "size-7 min-h-7 p-0")}>
              <ImageFill aria-hidden="true" className="size-3.5" />
            </Link>
          </Tooltip> : <Tooltip content={t("withoutImage")} placement="bottom"><span tabIndex={0} role="img" aria-label={t("withoutImage")}
            className="relative inline-flex size-7 items-center justify-center text-muted-foreground">
            <ImageIcon aria-hidden="true" className="size-3.5" /><SlashLg aria-hidden="true" className="absolute size-5" />
          </span></Tooltip>}</TableCell>
          <TableCell className="whitespace-nowrap tabular-nums">{date(product.updatedAt)}</TableCell>
          <TableCell actionColumn><div role="group" aria-label={t("actionsFor", { name: product.name })} className="flex items-center justify-end gap-1">
            <Button size="icon" tone="main-outline" className="size-7 p-0" aria-label={t("editFor", { name: product.name })}
              tooltip={t("editProduct")} tooltipPlacement="bottom" aria-haspopup="dialog" aria-controls="product-edit-panel"
              disabled={loading || pending} onClick={() => { setActiveId(null); setEditTarget(product); }}>
              <PencilSquare aria-hidden="true" className="size-3.5" />
            </Button>
            <VerticalDivider />
            {catalogStatusActions.map(({ status, icon, filledIcon, color }) => {
              const currentStatus = product.status === status;
              const StatusIcon = currentStatus ? filledIcon : icon;
              return <Button key={status} size="icon" tone="ghost" data-current-status={currentStatus ? "true" : undefined}
                className={`size-7 p-0 ${color}`} aria-label={t("setStatus", { name: product.name, status: t(`statuses.${status}`) })}
                tooltip={t(`statusActions.${status}`)} tooltipPlacement="bottom"
                disabled={loading || pending || !canChangeProductStatus(product.status, status)} onClick={() => mutate(product, status)}>
                <StatusIcon aria-hidden="true" className="size-3.5" />
              </Button>;
            })}
            <Button size="icon" tone="danger-outline" className="size-7 p-0" aria-label={t("permaDeleteFor", { name: product.name })}
              tooltip={t("perma_delete")} tooltipPlacement="bottom" aria-haspopup="dialog" disabled={loading || pending}
              onClick={() => { setDeleteError(false); setDeleteTarget(product); }}><Trash3 aria-hidden="true" className="size-3.5" /></Button>
            <VerticalDivider />
            <Button size="icon" tone={active ? "primary" : "ghost"} aria-label={t("detailsFor", { name: product.name })}
            aria-expanded={active} tooltip={t("additionalInfo")} tooltipPlacement="bottom"
            className={active ? "size-7 p-0" : "size-7 border-primary p-0 text-primary hover:bg-primary hover:text-primary-foreground"}
            onClick={event => { trigger.current = event.currentTarget; setActiveId(active ? null : product.uuid); }}>
            <Icon aria-hidden="true" className="size-3.5" />
          </Button></div></TableCell>
        </TableRow>;
      })}
      {!visibleProducts.length && !errorMessage && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">{emptyMessage}</TableCell></TableRow>}
    </TableBody>
    {deleteTarget && <Popup title={t("perma_delete")} disableClose={pending} onClose={() => setDeleteTarget(null)}
      content={<div className="space-y-2"><p>{t("deleteConfirmation", { name: deleteTarget.name })}</p>
        {deleteError && <p role="alert" className="text-error">{t("deleteFailed")}</p>}</div>}
      actions={<>
        <Button size="sm" disabled={pending} onClick={() => setDeleteTarget(null)}>{t("cancel")}</Button>
        <Button size="sm" tone="danger-outline" disabled={loading || pending} onClick={() => mutate(deleteTarget, "deleted")}>
          {pending ? <Throbber size="sm" label={t("deleting")} /> : t("perma_delete")}
        </Button>
      </>} />}
    {editTarget && <ProductFormAside key={editTarget.uuid} locale={locale} product={editTarget} onClose={() => setEditTarget(null)} onSaved={onChanged} />}
    {selected && <PushAside open onClose={() => setActiveId(null)} title={selected.name} triggerRef={trigger}>
      {selected.imageFileUuid && <ProductImagePreview key={selected.uuid} uuid={selected.uuid} name={selected.name} updatedAt={selected.updatedAt} />}
      <AsideSection title={t("additionalInfo")}><dl className="space-y-3">{[
        { label: "UUID", value: selected.uuid }, { label: t("code"), value: selected.code },
        { label: t("name"), value: selected.name }, { label: t("description"), value: selected.description ?? "—" },
        { label: t("status"), value: t(`statuses.${selected.status}`) },
        { label: t("price"), value: formatProductPrice(selected.price, selected.currency, locale) },
        { label: t("currency"), value: selected.currency }, { label: t("imageFileUuid"), value: selected.imageFileUuid ?? "—" },
        { label: t("createdAt"), value: date(selected.createdAt) }, { label: t("updatedAt"), value: date(selected.updatedAt) },
        { label: t("lastArchivedAt"), value: date(selected.lastArchivedAt) },
        { label: t("createdBy"), value: selected.createdByUuid }, { label: t("updatedBy"), value: selected.updatedByUuid },
      ].map(field => <div key={field.label}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="whitespace-pre-wrap wrap-anywhere">{field.value}</dd></div>)}</dl></AsideSection>
      <ChangeHistory entity="product" uuid={selected.uuid} />
    </PushAside>}
  </>;
}
