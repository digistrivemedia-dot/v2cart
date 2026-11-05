/**
 * Self-check for the cart/order totals. These must agree with the web
 * checkout, so they get asserted rather than eyeballed.
 *
 * Run with: node src/utils/pricing.check.mjs
 */
import assert from 'node:assert';
import {
  cartTotals, unitPrice, lineTotal, formatRupees, isOutOfStock, discountPercent,
  DEFAULT_TAX_RATE, SHIPPING_FLAT,
} from './pricing.js';

const p = (over = {}) => ({ _id: 'p', price: 120, stock: 10, ...over });

// --- The worked example from the web: one ₹120 tile -----------------------
{
  const t = cartTotals([{ product: p(), quantity: 1 }]);
  assert.strictEqual(t.itemsPrice, 120);
  assert.strictEqual(t.taxPrice, 21.6, '18% of 120');
  assert.strictEqual(t.shippingPrice, 200, 'under the free-shipping threshold');
  assert.strictEqual(t.total, 341.6, 'matches what the web charges');
  assert.strictEqual(t.itemCount, 1);
}

// --- Free shipping kicks in strictly ABOVE 5000 ---------------------------
{
  const at5000 = cartTotals([{ product: p({ price: 5000 }), quantity: 1 }]);
  assert.strictEqual(at5000.shippingPrice, 200, 'exactly 5000 still pays shipping');

  const over = cartTotals([{ product: p({ price: 5001 }), quantity: 1 }]);
  assert.strictEqual(over.shippingPrice, 0);
}

// --- An empty cart must be all zeros, never ₹200 of shipping --------------
{
  const t = cartTotals([]);
  assert.deepStrictEqual(
    { items: t.itemsPrice, tax: t.taxPrice, ship: t.shippingPrice, total: t.total, n: t.itemCount },
    { items: 0, tax: 0, ship: 0, total: 0, n: 0 }
  );
}

// --- Variant pricing: own price wins, otherwise inherit -------------------
{
  assert.strictEqual(unitPrice(p(), { price: 150 }), 150, 'variant price wins');
  assert.strictEqual(unitPrice(p(), { price: null }), 120, 'vendor variants inherit');
  assert.strictEqual(unitPrice(p(), undefined), 120);
  // A zero variant price is a real price, not "missing".
  assert.strictEqual(unitPrice(p(), { price: 0 }), 0);
}

// --- Quantities and multiple lines ----------------------------------------
{
  const t = cartTotals([
    { product: p({ price: 120 }), quantity: 3 },
    { product: p({ price: 99.5 }), quantity: 2 },
  ]);
  assert.strictEqual(t.itemsPrice, 559, '360 + 199');
  assert.strictEqual(t.itemCount, 5);
  assert.strictEqual(lineTotal({ product: p({ price: 99.5 }), quantity: 2 }), 199);
}

// --- Fractional prices must not drift into float noise --------------------
{
  const t = cartTotals([{ product: p({ price: 83.33 }), quantity: 3 }]);
  assert.strictEqual(t.itemsPrice, 249.99);
  assert.ok(Number.isFinite(t.total));
  assert.strictEqual(String(t.taxPrice).length <= 6, true, `tax was ${t.taxPrice}`);
}

// --- A discount can never push the payable below zero ---------------------
{
  const t = cartTotals([{ product: p(), quantity: 1 }], 99999);
  assert.strictEqual(t.payable, 0);
}

// --- Formatting: Indian grouping ------------------------------------------
assert.strictEqual(formatRupees(124500), '₹1,24,500');
assert.strictEqual(formatRupees(0), '₹0');
assert.strictEqual(formatRupees(1234.5, { decimals: true }), '₹1,234.50');

// --- Stock + discount badge ------------------------------------------------
assert.strictEqual(isOutOfStock({ stock: 0 }), true);
assert.strictEqual(isOutOfStock({ stock: 5 }), false);
assert.strictEqual(isOutOfStock({}), false, 'missing stock is not "out of stock"');
assert.strictEqual(discountPercent({ price: 120, cuttedPrice: 150 }), 20);
assert.strictEqual(discountPercent({ price: 120, cuttedPrice: 100 }), 0, 'never negative');
assert.strictEqual(discountPercent({ price: 120 }), 0);

// --- The tax rate is a parameter, not a constant -------------------------
// It comes from platform settings now, and the amount charged is whatever
// cartTotals returns — so the rate has to actually flow through.
{
  const items = [{ product: { price: 100 }, variant: null, quantity: 1 }];

  assert.strictEqual(cartTotals(items, 0, 0.18).taxPrice, 18, '18% applies');
  assert.strictEqual(cartTotals(items, 0, 0.05).taxPrice, 5, '5% applies');
  assert.strictEqual(cartTotals(items, 0, 0).taxPrice, 0, 'zero-rated is legal');
  assert.strictEqual(cartTotals(items, 0, 0).total, 100 + SHIPPING_FLAT, 'no tax, still shipping');

  // Omitting the rate falls back to the historical one rather than to zero,
  // so a caller that forgets it under-charges nobody.
  assert.strictEqual(cartTotals(items).taxPrice, cartTotals(items, 0, DEFAULT_TAX_RATE).taxPrice);
  assert.strictEqual(DEFAULT_TAX_RATE, 0.18);

  // Tax is charged on the items subtotal, before shipping.
  const big = [{ product: { price: 10000 }, variant: null, quantity: 1 }];
  const t = cartTotals(big, 0, 0.18);
  assert.strictEqual(t.shippingPrice, 0, 'free over the threshold');
  assert.strictEqual(t.taxPrice, 1800);
  assert.strictEqual(t.total, 11800);
}

console.log('pricing: all checks passed');
