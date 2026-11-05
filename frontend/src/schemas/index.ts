import { z } from "zod";

// Mock schemas for frontend-only app
export const ProductWithVariantsSchema = z.any();
export const CartItemSchema = z.any();
export const OrderWithDetailsSchema = z.any();
export const InsertOrderItemSchema = z.any();
export const InsertCustomerInfoSchema = z.any();
export const InsertOrderProductSchema = z.any();
export const ProductSizeEnum = z.enum(["12x12", "12x24", "16x16", "18x18", "24x24", "32x32"]);
export const WishlistItemSchema = z.any();

// Coupon schemas
export const CouponSchema = z.object({
  _id: z.string(),
  code: z.string(),
  description: z.string().optional(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.number(),
  minPurchaseAmount: z.number().default(0),
  maxDiscountAmount: z.number().nullable().optional(),
  usageLimit: z.number().nullable().optional(),
  usageCount: z.number().default(0),
  perUserLimit: z.number().default(1),
  expiryDate: z.string(),
  isActive: z.boolean().default(true),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateCouponSchema = z.object({
  code: z.string().min(3, "Code must be at least 3 characters").max(20, "Code cannot exceed 20 characters"),
  description: z.string().max(200, "Description cannot exceed 200 characters").optional(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.number().positive("Discount value must be positive"),
  minPurchaseAmount: z.number().min(0).default(0),
  maxDiscountAmount: z.number().positive().nullable().optional(),
  usageLimit: z.number().positive().nullable().optional(),
  perUserLimit: z.number().positive().default(1),
  expiryDate: z.string(),
  isActive: z.boolean().default(true),
});

/**
 * Phase 23 — a coupon is quoted against the CART, not against a total the
 * client computed.
 *
 * Sending `orderAmount` meant the server discounted a figure that already
 * included GST and shipping, and it had no way to cap the discount at the
 * platform's margin — so the quote could promise more than checkout would
 * accept, and the order was refused for underpaying after the customer had
 * paid. `orderAmount` stays optional for the mobile app until it is updated.
 */
export const ValidateCouponSchema = z.object({
  code: z.string(),
  items: z
    .array(z.object({ product: z.string(), quantity: z.number().int().min(1) }))
    .optional(),
  orderAmount: z.number().optional(),
});

/**
 * One margin band: "sells within `days` -> the investor earns `pct`".
 *
 * Set per PRODUCT, by admin, at approval (Phase 20). Categories used to carry
 * sell-speed windows and a margin % per tier; that was the wrong grain — two
 * phones want different numbers — so both moved onto the product.
 *
 * `high` is the SLOWEST, best-paying band: the name tracks the percentage, not
 * the speed. See backend/utils/marginBands.js, which owns every rule about
 * these numbers.
 */
export const MarginBandSchema = z.object({
  days: z.number().nullable().optional(),
  pct: z.number().nullable().optional(),
});

/**
 * A product's three bands. All six numbers or none — a half-filled set would
 * mix the product's values with the platform defaults and silently pay the
 * wrong percentage.
 */
export const MarginBandsSchema = z.object({
  low: MarginBandSchema,
  medium: MarginBandSchema,
  high: MarginBandSchema,
});

/** Which band a product currently sits in. Exactly one at a time. */
export const MarginCategorySchema = z.enum(["low", "medium", "high"]);

// Phase 21 — the return rules, and the reason settlement is not instant.
//
// `full` is the only one that holds money: a replacement costs the vendor a
// unit rather than the platform any cash, so `replacement_only` and `none`
// settle at delivery. RAM and memory cards are the `none` case.
export const ReturnPolicySchema = z.enum(["full", "replacement_only", "none"]);

export const ReturnPolicyFieldsSchema = z.object({
  returnPolicy: ReturnPolicySchema.nullable().optional(),
  returnWindowDays: z
    .number()
    .int("Use a whole number of days")
    .min(0, "A return window cannot be negative")
    .max(180, "That window holds the vendor's money for too long — check it is days, not a date")
    .nullable()
    .optional(),
});

// Category schemas - Define base schema first
const CategoryBaseSchema = z.object({
  _id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  parent: z.string().nullable().optional(),
  level: z.number().default(0),
  order: z.number().default(0),
  productCount: z.number().default(0),
  isActive: z.boolean().default(true),
  createdBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Define with recursive children for 3-level hierarchy
export const CategorySchema: z.ZodType<any> = CategoryBaseSchema.extend({
  children: z.lazy(() => z.array(CategorySchema)).optional(),
});

export const CreateCategorySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100, "Name cannot exceed 100 characters"),
  description: z.string().max(500, "Description cannot exceed 500 characters").optional(),
  parent: z.string().nullable().optional(),
  order: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
});

// Marketplace pricing/listing fields (see MARKETPLACE_CONVERSION_PLAN.md).
// Kept as their own real schema rather than folded into the (untyped)
// `Product = any` alias below — that alias is load-bearing for ~49 existing
// files and retyping it fully is out of scope for this phase.
export const ProductPricingSchema = z.object({
  vendorPrice: z.number().nullable().optional(),
  /** Per-product margin override; null means "follow the global margin". */
  marginPct: z.number().nullable().optional(),
  investorPrice: z.number().nullable().optional(),
  investorPayout: z.number().nullable().optional(),
  investableUnits: z.number().nullable().optional(),
  pricingStatus: z.enum(["pending_pricing", "priced"]),
  listingStatus: z.enum(["draft", "pending_approval", "live", "rejected", "paused"]),
  returnPolicy: ReturnPolicySchema.nullable().optional(),
  returnWindowDays: z.number().nullable().optional(),
});

// Only the listing price and the margin are settable — vendorPrice/
// investorPrice/investorPayout are derived from those two by the backend
// (MARKETPLACE_CONVERSION_PLAN.md Phase 10), so sending them is meaningless.
//
// marginPct is tri-state: a number overrides the global margin for this
// product, null clears the override, and omitting it leaves it unchanged.
export const UpdateProductPricingSchema = z.object({
  price: z.number().positive("Customer price must be positive"),
  marginPct: z.number().min(0, "Margin cannot be negative").nullable().optional(),
  investableUnits: z.number().min(0).nullable().optional(),
  // Omit to leave stored bands alone; send a complete set to replace them, or
  // an empty object to fall back to the platform defaults.
  marginBands: MarginBandsSchema.nullable().optional(),
  marginCategory: MarginCategorySchema.nullable().optional(),
}).merge(ReturnPolicyFieldsSchema);

export const UpdateListingStatusSchema = z.object({
  listingStatus: z.enum(["draft", "pending_approval", "live", "rejected", "paused"]),
  rejectionNote: z.string().max(500).nullable().optional(),
  // Approval is where admin decides what investors earn on this product, so
  // the bands and the starting band ride along with the status change — and
  // since Phase 21, how long its money is held after delivery.
  marginBands: MarginBandsSchema.nullable().optional(),
  marginCategory: MarginCategorySchema.nullable().optional(),
}).merge(ReturnPolicyFieldsSchema);

export type ProductWithVariants = any;
export type ProductVariant = any;
export type Product = any;
export type CartItem = any;
export type ProductSize = string;
export type ProductCategory = string;
export type OrderItem = any;
export type CustomerInfo = any;
export type OrderProduct = any;
export type ProductFormData = any;
export type WishlistItem = any;
export type OrderProductWithDetails = any;
export type OrderWithDetails = any;
export type Address = any;

export type Coupon = z.infer<typeof CouponSchema>;
export type CreateCoupon = z.infer<typeof CreateCouponSchema>;
export type ValidateCoupon = z.infer<typeof ValidateCouponSchema>;

export type Category = z.infer<typeof CategorySchema>;
export type CreateCategory = z.infer<typeof CreateCategorySchema>;

export type ProductPricing = z.infer<typeof ProductPricingSchema>;
export type UpdateProductPricing = z.infer<typeof UpdateProductPricingSchema>;
export type UpdateListingStatus = z.infer<typeof UpdateListingStatusSchema>;
