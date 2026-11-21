// Access is resolved at request time; the shared authenticated shell can block navigation.
export const instant = false;

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { parseProductQuery, type ProductPage, type ProductQuery } from "@/schemas/product";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { withAdminSession } from "@/server/auth/admin-action";
import { loadProducts } from "@/server/products";
import { Heading } from "@/ui/basic";
import { ProductsResults } from "./products-results";
import { ProductCreatePanel } from "./product-create-panel";
import type { TableRefreshResult } from "@/ui/components/use-table-refresh";

async function ProductsContent({ params, searchParams }: PageProps<"/[locale]/admin/products">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  await requireAdminAccess();
  const query = parseProductQuery(await searchParams);
  const t = await getTranslations({ locale, namespace: "common.admin.products" });
  async function refreshProducts(nextQuery: ProductQuery = query): Promise<TableRefreshResult<ProductPage>> {
    "use server";
    return withAdminSession(async () => {
      const page = await loadProducts(nextQuery).catch(() => null);
      return page ? { status: "ok" as const, page } : { status: "failed" as const };
    });
  }
  return <article aria-labelledby="products-title" className="min-w-0 space-y-1">
    <Heading level={2} id="products-title" className="pb-4 text-xl">{t("title")}</Heading>
    <ProductsResults locale={locale} query={query} initial={null} refreshAction={refreshProducts} />
    <ProductCreatePanel locale={locale} query={query} />
  </article>;
}

export default function ProductsPage(props: PageProps<"/[locale]/admin/products">) {
  return <Suspense fallback={null}><ProductsContent {...props} /></Suspense>;
}
