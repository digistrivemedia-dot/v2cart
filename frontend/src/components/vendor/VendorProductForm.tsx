"use client";

import { SimpleProductForm } from "@/components/admin/SimpleProductForm";

interface VendorProductFormProps {
  mode: "create" | "edit";
  productId?: string;
  initialProduct?: any;
}

/**
 * Vendors now get the same full product form as admin — drag-and-drop images
 * with a featured picker, category/brand/sub-brand, specs, variants,
 * highlights, care instructions, tags, and the live preview card.
 *
 * It's literally the same component rather than a copy: a second 1500-line
 * form would drift from this one within a release. SimpleProductForm takes a
 * `role` that defaults to "admin", so the admin route behaves exactly as it
 * did before.
 *
 * Three things vendors don't get, each because the backend would reject or
 * mis-handle it rather than as an arbitrary restriction:
 *   • MRP (`cuttedPrice`) — it's in ADMIN_ONLY_FIELDS and gets stripped
 *   • per-variant pricing — would break the margin math, since checkout
 *     charges `variant.price` while settlement pays the investor
 *     `product.price` (MARKETPLACE_CONVERSION_PLAN.md Phase 10, known gaps)
 *   • publishing — a vendor listing goes to pending_approval for review
 */
export function VendorProductForm({ mode, productId, initialProduct }: VendorProductFormProps) {
  return (
    <SimpleProductForm
      role="vendor"
      mode={mode}
      initialProduct={initialProduct}
      editProductId={productId}
    />
  );
}
