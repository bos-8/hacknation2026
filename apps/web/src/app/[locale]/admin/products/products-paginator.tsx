import type { AppLocale } from "@/schemas/i18n";
import { PRODUCT_PAGE_SIZES, productUrlParams, type ProductQuery } from "@/schemas/product";
import { TablePaginator } from "@/ui/components/table-paginator";

export function ProductsPaginator({ locale, query, total, rowCount }: { locale: AppLocale; query: ProductQuery; total: number | null; rowCount: number }) {
  return <TablePaginator locale={locale} namespace="common.admin.products" pathname="/admin/products"
    params={productUrlParams(query)} page={query.page} limit={query.limit} total={total ?? 0} unavailable={total === null} rowCount={rowCount} sizes={PRODUCT_PAGE_SIZES} />;
}
