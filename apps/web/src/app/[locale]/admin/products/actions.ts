"use server";

import { withAdminSession } from "@/server/auth/admin-action";
import { createProduct } from "@/server/create-product";
import { deleteProduct, editProduct, updateProductStatus } from "@/server/product-status";
import { productDeleteSchema, productStatusChangeSchema, type ProductDelete, type ProductStatusChange, type ProductStatusResult } from "@/schemas/product-status";
import { PRODUCT_IMAGE_MAX_BYTES, productCreateSchema, productEditSchema, type ProductCreateField, type ProductCreateResult, type ProductEditResult } from "@/schemas/product";

export async function saveProduct(form: FormData): Promise<ProductEditResult> {
  return withAdminSession<ProductEditResult>(async actorUuid => {
    const parsed = productEditSchema.safeParse(Object.fromEntries(form.entries()));
    if (!parsed.success) return { status: "invalid", fields: parsed.error.issues.map(issue => issue.path[0] as ProductCreateField) };
    const file = form.get("image");
    const empty = file === null || file instanceof File && !file.name && !file.size;
    if (!empty && (!(file instanceof File) || !file.size)) return { status: "invalidImage" };
    if (file instanceof File && file.size > PRODUCT_IMAGE_MAX_BYTES) return { status: "tooLarge" };
    try { return await editProduct(parsed.data, actorUuid, !empty && file instanceof File ? new Uint8Array(await file.arrayBuffer()) : undefined); }
    catch { return { status: "failed" }; }
  });
}

export async function changeProductStatus(input: ProductStatusChange): Promise<ProductStatusResult> {
  return withAdminSession<ProductStatusResult>(async actorUuid => {
    const parsed = productStatusChangeSchema.safeParse(input);
    if (!parsed.success) return { status: "invalid" };
    try { return await updateProductStatus(parsed.data, actorUuid); }
    catch { return { status: "failed" }; }
  });
}

export async function permanentlyDeleteProduct(input: ProductDelete): Promise<ProductStatusResult> {
  return withAdminSession<ProductStatusResult>(async actorUuid => {
    const parsed = productDeleteSchema.safeParse(input);
    if (!parsed.success) return { status: "invalid" };
    try { return await deleteProduct(parsed.data, actorUuid); }
    catch { return { status: "failed" }; }
  });
}

export async function addProduct(form: FormData): Promise<ProductCreateResult> {
  return withAdminSession<ProductCreateResult>(async actorUuid => {
    const parsed = productCreateSchema.safeParse(Object.fromEntries(
      ["code", "name", "description", "price", "currency", "status"].map(key => [key, form.get(key)]),
    ));
    if (!parsed.success) return { status: "invalid", fields: [...new Set(parsed.error.issues.map(issue => issue.path[0] as ProductCreateField))] };
    const file = form.get("image");
    const empty = file === null || file instanceof File && !file.name && !file.size;
    if (!empty && (!(file instanceof File) || !file.size)) return { status: "invalidImage" };
    if (file instanceof File && file.size > PRODUCT_IMAGE_MAX_BYTES) return { status: "tooLarge" };
    try {
      return await createProduct(parsed.data, actorUuid, !empty && file instanceof File ? new Uint8Array(await file.arrayBuffer()) : undefined);
    } catch { return { status: "failed" }; }
  });
}
