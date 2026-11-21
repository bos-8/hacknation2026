"use client";

import { useTranslations } from "next-intl";
import { ChevronDoubleLeft, ChevronDoubleRight, ChevronLeft, ChevronRight } from "react-bootstrap-icons";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/schemas/i18n";
import { Button, Input, Tooltip } from "@/ui/basic";
import { TablePageSize } from "./table-page-size";
import { tablePaginatorOptions, tableStyles } from "./styles";

export type TablePaginatorProps = {
  locale: AppLocale;
  namespace: string;
  pathname: "/forms" | "/admin/users" | "/admin/files" | "/admin/files/ocr" | "/admin/products" | "/admin/tags" | "/admin/queue" | "/admin/settings";
  params: Record<string, string>;
  page: number;
  limit: number;
  total: number;
  rowCount: number;
  sizes: readonly number[];
  maxPage?: number;
  unavailable?: boolean;
};

export function TablePaginator({ locale, namespace, pathname, params, page, limit, total, rowCount, sizes, maxPage = 40001, unavailable = false }: TablePaginatorProps) {
  const t = useTranslations(namespace);
  const lastPage = Math.min(maxPage, Math.max(1, Math.ceil(total / limit)));
  const current = page;
  const start = Math.max(1, Math.min(current - Math.floor(tablePaginatorOptions.pageWindow / 2), lastPage - tablePaginatorOptions.pageWindow + 1));
  const numbers = Array.from({ length: Math.min(tablePaginatorOptions.pageWindow, lastPage) }, (_, index) => start + index);
  const from = rowCount ? (page - 1) * limit + 1 : 0;
  const to = rowCount ? from + rowCount - 1 : 0;
  const action = `/${locale}${pathname}`;
  const fields = (omit: string[]) => Object.entries(params).filter(([name]) => !omit.includes(name)).map(([name, value]) =>
    <input key={name} type="hidden" name={name} value={value} />);
  const tip = (label: string, children: ReactNode) => <Tooltip content={label} placement={tablePaginatorOptions.tooltipPlacement}>{children}</Tooltip>;
  function arrow(target: number, label: string, icon: ReactNode, disabled: boolean) {
    return tip(label, disabled || unavailable
      ? <Button size="icon" tone="main-outline" className={tableStyles.iconButton} disabled aria-label={label}>{icon}</Button>
      : <Link href={{ pathname, query: { ...params, page: String(target) } }} locale={locale} prefetch={false}
        className={tableStyles.iconButton} aria-label={label}>{icon}</Link>);
  }

  return <div className="@container"><nav aria-label={t("pagination")} data-unavailable={unavailable || undefined} className={tableStyles.paginator}>
    <div className={tableStyles.counters} aria-live="polite">
      <span>{unavailable ? t("resultsUnavailable") : t("resultSummary", { from, to, total })}</span>
      <span>{unavailable ? t("pagesUnavailable") : t("pageSummary", { page: current, totalPages: lastPage })}</span>
    </div>
    <div className={tableStyles.pages}>
      {arrow(1, t("first"), <ChevronDoubleLeft aria-hidden="true" className="size-3.5" />, page <= 1)}
      {arrow(Math.min(page - 1, lastPage), t("previous"), <ChevronLeft aria-hidden="true" className="size-3.5" />, page <= 1)}
      {numbers.map(number => number === current
        ? <form data-table-query key={number} action={action} method="get" aria-current={page === current ? "page" : undefined} className={tableStyles.jumpForm}>
          {fields(["page"])}
          <Input type="number" min={1} max={lastPage} name="page" defaultValue={current} required disabled={unavailable || lastPage === 1 && page === current}
            aria-label={t("jumpLabel")} className={tableStyles.jumpInput} />
          <Button type="submit" tone="ghost" size="icon" disabled={unavailable || lastPage === 1 && page === current}
            aria-label={t("jump")} tooltip={t("jump")} tooltipPlacement={tablePaginatorOptions.tooltipPlacement} className={tableStyles.jumpButton}>
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </Button>
        </form>
        : <Tooltip key={number} content={t("pageNumber", { page: number })} placement={tablePaginatorOptions.tooltipPlacement}>
          <Link href={{ pathname, query: { ...params, page: String(number) } }} locale={locale} prefetch={false}
            aria-label={t("pageNumber", { page: number })} className={tableStyles.pageButton}>{number}</Link>
        </Tooltip>)}
      {arrow(page + 1, t("next"), <ChevronRight aria-hidden="true" className="size-3.5" />, page >= lastPage)}
      {arrow(lastPage, t("last"), <ChevronDoubleRight aria-hidden="true" className="size-3.5" />, page === lastPage)}
    </div>
    <form data-table-query action={action} method="get" className={tableStyles.pageSizeForm}>
      {fields(["page", "limit"])}
      <span className="whitespace-nowrap text-xs text-muted-foreground">{t("perPage")}</span>
      <TablePageSize key={limit} limit={limit} label={t("rowsPerPage")} sizes={sizes} disabled={unavailable} />
    </form>
  </nav></div>;
}
