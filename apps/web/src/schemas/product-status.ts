import { z } from "zod";
import { productStatusSchema, type ProductStatus } from "./product.ts";

export const productTargetStatusSchema = z.enum(["active", "inactive", "pending_archiving", "pending_deletion"]);
export type ProductTargetStatus = z.infer<typeof productTargetStatusSchema>;

export function canChangeProductStatus(from: ProductStatus, to: ProductStatus) {
  return from !== to && productTargetStatusSchema.safeParse(to).success;
}

export const productStatusChangeSchema = z.object({
  uuid: z.uuid(), expectedStatus: productStatusSchema, status: productTargetStatusSchema,
}).refine(input => canChangeProductStatus(input.expectedStatus, input.status), {
  message: "Product status transition is not allowed", path: ["status"],
});
export const productDeleteSchema = z.object({ uuid: z.uuid(), expectedStatus: productStatusSchema, expectedUpdatedAt: z.iso.datetime() });
export type ProductStatusChange = z.infer<typeof productStatusChangeSchema>;
export type ProductDelete = z.infer<typeof productDeleteSchema>;
export type ProductStatusResult = { status: "ok" | "invalid" | "denied" | "conflict" | "failed" };
