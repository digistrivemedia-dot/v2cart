/**
 * Cart and order totals.
 *
 * These numbers MUST match the web checkout exactly — the same cart has to
 * cost the same on both, and the backend records the order from whatever the
 * client sends. Mirrored from tilesecommerse/src/components/checkout/
 * CheckoutForm.tsx: ₹200 shipping waived over ₹5,000.
 *
 * The tax rate is passed in rather than hardcoded: it is set by admin and read
 * from /pricing-settings (see store/settingsStore.js). It used to be a literal
 * 0.18 here, in the web cart and in the web checkout independently.
 *
 * Keep it a pure module with no React: that's what makes it testable, and
 * these are the numbers worth testing.
 */

/**
 * The historical rate, kept only as the default argument so a caller that
 * hasn't loaded settings yet still produces sane display numbers. Orders are
 * never placed on it — checkout waits for the real rate.
 */
export const DEFAULT_TAX_RATE = 0.18;
export const SHIPPING_FLAT = 200;
export const FREE_SHIPPING_OVER = 5000;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Price for a line, honouring a chosen variant.
 *
 * Mirrors the web's `getPriceForSize`: a variant may carry its own price, and
 * otherwise inherits the product's. Vendor-created variants never carry one
 * (a per-variant price would break the investor margin math), so those always
 * fall through to the product price.
 */
export function unitPrice(product, variant) {
  if (variant && variant.price != null) return Number(variant.price) || 0;
  return Number(product?.price) || 0;
}

export function lineTotal(item) {
  return round2(unitPrice(item.product, item.variant) * item.quantity);
}

/**
 * @param {Array} items  cart lines
 * @param {number} discount  coupon discount already validated by the backend
 * @param {number} taxRate  GST as a fraction (0.18 for 18%), from settings
 */
export function cartTotals(items = [], discount = 0, taxRate = DEFAULT_TAX_RATE) {
  const itemsPrice = round2(items.reduce((sum, i) => sum + lineTotal(i), 0));
  const taxPrice = round2(itemsPrice * taxRate);
  // Free shipping is decided on the items subtotal, before tax — same as web.
  const shippingPrice = itemsPrice > FREE_SHIPPING_OVER || itemsPrice === 0 ? 0 : SHIPPING_FLAT;
  const total = round2(itemsPrice + taxPrice + shippingPrice);
  const payable = round2(Math.max(total - (Number(discount) || 0), 0));

  return {
    itemsPrice,
    taxPrice,
    shippingPrice,
    total,
    discount: round2(Number(discount) || 0),
    payable,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
  };
}

/** "₹1,24,500" — Indian digit grouping, no decimals for whole rupees. */
export function formatRupees(value, { decimals = false } = {}) {
  const n = Number(value) || 0;
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })}`;
}

/** Stock is the single source of truth for whether a product can be bought. */
export function isOutOfStock(product) {
  return product?.stock !== undefined && Number(product.stock) <= 0;
}

export function discountPercent(product) {
  const price = Number(product?.price) || 0;
  const cutted = Number(product?.cuttedPrice) || 0;
  if (cutted <= price || price <= 0) return 0;
  return Math.round(((cutted - price) / cutted) * 100);
}
