import { z } from "zod";

export const productStatusSchema = z.enum(["active", "inactive", "pending_archiving", "archived", "pending_deletion", "softdelete"]);
export type ProductStatus = z.infer<typeof productStatusSchema>;
export const PRODUCT_PAGE_SIZES = [1, 10, 25, 50] as const;
export const productSortSchema = z.enum(["code", "name", "status", "price", "currency", "updatedAt"]);
export const productQuerySchema = z.object({
  page: z.number().int().min(1).max(40001).default(1),
  limit: z.literal(PRODUCT_PAGE_SIZES).default(25),
  search: z.string().trim().max(200).default(""),
  status: productStatusSchema.optional(),
  image: z.enum(["with", "without"]).optional(),
  sort: productSortSchema.default("code"),
  direction: z.enum(["asc", "desc"]).default("asc"),
});
export type ProductQuery = z.infer<typeof productQuerySchema>;

export function parseProductQuery(params: Record<string, string | string[] | undefined>): ProductQuery {
  const page = typeof params.page === "string" && /^[1-9]\d{0,4}$/.test(params.page) ? Number(params.page) : 1;
  return {
    page: productQuerySchema.shape.page.safeParse(page).data ?? 1,
    limit: typeof params.limit === "string" ? PRODUCT_PAGE_SIZES.find(value => String(value) === params.limit) ?? 25 : 25,
    search: productQuerySchema.shape.search.safeParse(params.search).data ?? "",
    status: productStatusSchema.safeParse(params.status).data,
    image: productQuerySchema.shape.image.safeParse(params.image).data,
    sort: productSortSchema.safeParse(params.sort).data ?? "code",
    direction: params.direction === "desc" ? "desc" : "asc",
  };
}

export function productUrlParams(query: ProductQuery): Record<string, string> {
  return {
    page: String(query.page), limit: String(query.limit), sort: query.sort, direction: query.direction,
    ...(query.search ? { search: query.search } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.image ? { image: query.image } : {}),
  };
}

export const productPriceSchema = z.string().regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/);
export const productCurrencySchema = z.string().regex(/^[A-Z]{3}$/);
export const PRODUCT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const PRODUCT_CURRENCIES = Intl.supportedValuesOf("currency");
export const productCreateSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,63}$/),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10000).transform(value => value || null),
  price: z.string().trim().transform(value => value.replace(",", ".")).pipe(productPriceSchema),
  currency: z.string().trim().toUpperCase().pipe(productCurrencySchema).refine(value => PRODUCT_CURRENCIES.includes(value)),
  status: z.enum(["active", "inactive"]),
});
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductCreateField = keyof ProductCreateInput;
export const productEditFieldsSchema = productCreateSchema.omit({ status: true });
export const productEditSchema = productEditFieldsSchema.extend({ uuid: z.uuid(), expectedUpdatedAt: z.iso.datetime() });
export type ProductEditInput = z.infer<typeof productEditSchema>;
export type ProductEditResult = { status: "ok"; uuid: string }
  | { status: "invalid"; fields?: ProductCreateField[] }
  | { status: "denied" | "duplicate" | "conflict" | "invalidImage" | "tooLarge" | "failed" };
export type ProductCreateResult = { status: "ok"; uuid: string }
  | { status: "invalid"; fields?: ProductCreateField[] }
  | { status: "denied" | "duplicate" | "invalidImage" | "tooLarge" | "failed" };
export type ProductRow = {
  uuid: string; code: string; name: string; description: string | null; status: ProductStatus;
  price: string; currency: string; imageFileUuid: string | null; imageFileName: string | null;
  createdAt: Date; updatedAt: Date; lastArchivedAt: Date | null; createdByUuid: string; updatedByUuid: string;
};
export type ProductPage = { products: ProductRow[]; total: number };

/** Preserve the exact Decimal value instead of converting money to a JS float. */
export function formatProductPrice(price: string, currency: string, locale: string) {
  const [integer, fraction = ""] = productPriceSchema.parse(price).split(".");
  const options = { style: "currency" as const, currency: productCurrencySchema.parse(currency), maximumFractionDigits: 4 };
  const minimum = new Intl.NumberFormat(locale, options).resolvedOptions().minimumFractionDigits ?? 0;
  const digits = Math.max(minimum, fraction.replace(/0+$/, "").length);
  const formatter = new Intl.NumberFormat(locale, { ...options, minimumFractionDigits: digits, maximumFractionDigits: digits });
  const digitFormatter = new Intl.NumberFormat(locale, { useGrouping: false });
  const localizedFraction = [...fraction.padEnd(digits, "0").slice(0, digits)].map(digit => digitFormatter.format(Number(digit))).join("");
  return formatter.formatToParts(BigInt(integer)).map(part => part.type === "fraction" ? localizedFraction : part.value).join("");
}
