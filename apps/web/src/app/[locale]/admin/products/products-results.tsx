"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowClockwise, ChevronDown, ChevronExpand, ChevronUp } from "react-bootstrap-icons";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/schemas/i18n";
import { parseProductQuery, productSortSchema, productStatusSchema, productUrlParams, type ProductPage, type ProductQuery } from "@/schemas/product";
import { Button, Table, TableHead, TableHeader, TableRow, Throbber } from "@/ui/basic";
import { TableFilters } from "@/ui/components/table-filters";
import { TableSearch } from "@/ui/components/table-search";
import { useTableRefresh, type TableRefreshResult } from "@/ui/components/use-table-refresh";
import { useNotifications } from "@/ui/components/notification-provider";
import { ProductsTableBody } from "./products-table-body";
import { ProductsPaginator } from "./products-paginator";
import { TableQuery, useTableQuery } from "@/ui/components/table-query";
import { ProductCreateButton } from "./product-create-panel";
import { TableDataRegion } from "@/ui/components/table-data-region";

export function ProductsResults({ locale, query: initialQuery, initial, refreshAction }: {
  locale: AppLocale; query: ProductQuery; initial: ProductPage | null;
  refreshAction: (query: ProductQuery) => Promise<TableRefreshResult<ProductPage>>;
}) {
  const namespace = "common.admin.products";
  const t = useTranslations(namespace);
  const query = useTableQuery(initialQuery, parseProductQuery);
  const { result, refresh, pending, status } = useTableRefresh(initial, query, refreshAction);
  const { owner, pushNotification, removeNotification } = useNotifications();
  const products = result?.products ?? [];
  const errorMessage = pending ? undefined : !result ? t(status === "denied" ? "loadDenied" : "loadError") : status === "failed" ? t("refreshError") : undefined;
  useEffect(() => {
    if (!owner || pending) return;
    const id = "products-table-load-error";
    if (errorMessage) pushNotification({ id, mode: "error", message: errorMessage, brief: true });
    else removeNotification(id);
  }, [owner, pending, errorMessage, pushNotification, removeNotification]);
  const preserved = productUrlParams(query);
  delete preserved.page;
  const values: Record<string, string> = {};
  if (query.status) values.status = query.status;
  if (query.image) values.image = query.image;
  const filterPreserved = { ...preserved };
  delete filterPreserved.status;
  delete filterPreserved.image;
  const searchPreserved = { ...preserved };
  delete searchPreserved.search;
  const action = `/${locale}/admin/products`;
  const selectionKey = JSON.stringify([query.page, query.limit, query.search, query.status, query.image]);

  return <TableQuery locale={locale} pathname="/admin/products" pending={pending}>
    <TableFilters action={action} namespace={namespace} values={values} preserved={filterPreserved}
      definitions={[
        { key: "status", label: t("status"), options: productStatusSchema.options.map(value => ({ value, label: t(`statuses.${value}`) })) },
        { key: "image", label: t("image"), options: [{ value: "with", label: t("withImage") }, { value: "without", label: t("withoutImage") }] },
      ]}
      search={<TableSearch action={action} inputId="products-search" namespace={namespace} value={query.search} preserved={searchPreserved} />}
      actions={<ProductCreateButton locale={locale} query={query} />}
      refreshButton={<Button size="icon" className="size-7 p-0" aria-label={t("refresh")} tooltip={t("refresh")} tooltipPlacement="bottom"
        disabled={pending} onClick={refresh}>{pending ? <Throbber size="sm" /> : <ArrowClockwise aria-hidden="true" className="size-3.5" />}</Button>} />
      <TableDataRegion label={t("title")}>
        <Table className="[&_th]:py-1 [&_td:not([colspan])]:py-1">
          <caption className="sr-only">{t("title")}</caption>
          <TableHead><TableRow>
            <TableHeader className="w-1"><span className="sr-only">{t("selection")}</span></TableHeader>
            {(["code", "name", "price", "currency", "status", "image", "updatedAt"] as const).map(column => {
              const sort = productSortSchema.safeParse(column).data;
              if (!sort) return <TableHeader key={column}>{t(column)}</TableHeader>;
              const active = query.sort === sort;
              const descending = active && query.direction === "desc";
              const direction = active && !descending ? "desc" : "asc";
              const Icon = !active ? ChevronExpand : descending ? ChevronDown : ChevronUp;
              return <TableHeader key={column} className={`relative ${column === "price" ? "text-right" : ""}`}
                aria-sort={active ? descending ? "descending" : "ascending" : undefined}>
                <Link href={{ pathname: "/admin/products", query: { ...preserved, page: "1", sort, direction } }} locale={locale} prefetch={false}
                  aria-label={t(direction === "asc" ? "sortAscending" : "sortDescending", { column: t(column) })}
                  className="inline-flex items-center gap-1 whitespace-nowrap hover:text-primary focus-visible:outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">
                  {t(column)}<Icon aria-hidden="true" className={active ? "size-3.5 shrink-0 text-primary" : "size-3.5 shrink-0 text-muted-foreground"} />
                </Link>
              </TableHeader>;
            })}
            <TableHeader actionColumn className="w-1">{t("rowActions")}</TableHeader>
          </TableRow></TableHead>
          <ProductsTableBody key={selectionKey} products={products} locale={locale} loading={pending} errorMessage={errorMessage} onChanged={refresh}
            emptyMessage={t(query.page > Math.max(1, Math.ceil((result?.total ?? 0) / query.limit)) ? "outOfRange" : query.search || query.status || query.image ? "noResults" : "empty")} />
        </Table>
      </TableDataRegion>
      <ProductsPaginator locale={locale} query={query} total={result?.total ?? null} rowCount={products.length} />
  </TableQuery>;
}
