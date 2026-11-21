import "server-only";
import type { Prisma } from "@formiq/database";
import { getDatabase } from "./database.ts";
import { productCurrencySchema, productPriceSchema, productQuerySchema, type ProductPage, type ProductQuery } from "../schemas/product.ts";

export async function loadProducts(input: ProductQuery): Promise<ProductPage> {
  const query = productQuerySchema.parse(input);
  const search = query.search.replace(/[\\%_]/g, "\\$&");
  const where: Prisma.ProductWhereInput = {
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }] } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.image ? { imageFileUuid: query.image === "with" ? { not: null } : null } : {}),
  };
  const database = getDatabase();
  const [total, products] = await database.$transaction([
    database.product.count({ where }),
    database.product.findMany({
      where, skip: (query.page - 1) * query.limit, take: query.limit,
      orderBy: [{ [query.sort]: query.direction }, { uuid: "asc" }],
      select: {
        uuid: true, code: true, name: true, description: true, status: true, price: true, currency: true,
        imageFileUuid: true, imageFile: { select: { name: true } },
        createdAt: true, updatedAt: true, lastArchivedAt: true, createdByUuid: true, updatedByUuid: true,
      },
    }),
  ]);
  return { total, products: products.map(({ price, imageFile, ...product }) => ({
    ...product, price: productPriceSchema.parse(price.toFixed(4)), currency: productCurrencySchema.parse(product.currency),
    imageFileName: imageFile?.name ?? null,
  })) };
}
