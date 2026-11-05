/**
 * What an order actually costs, computed from the DATABASE — Phase 23.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * `/order/new` used to take `totalPrice` from the request body and record it.
 * Nothing recomputed it and nothing asked the gateway what had really been
 * paid, so a crafted request created a Confirmed order for any amount — proven
 * against the dev database with a fabricated payment id and `totalPrice: 1`.
 *
 * So the server computes the total itself, from product prices it looks up, the
 * GST and shipping rates in platform settings, and the coupon it validates
 * itself. The client's figure is only ever compared against this one.
 *
 * ── And why the ledger needs it too ───────────────────────────────────────
 *
 * Settlement priced every unit at `product.price` and never looked at the
 * coupon, so a discount was absorbed by nobody and reported by nothing:
 * platform profit read 15 on a sale that actually lost 5. The per-line
 * `netPrice` here is the discount-allocated price the ledger must use.
 *
 * Shipping and GST are computed and recorded but are NOT margin: GST is the
 * government's and shipping pays the courier. Keeping them out of the profit
 * calculation is deliberate, and storing them on the order is what makes an
 * invoice (and a GST return) possible at all — the schema used to drop them.
 */

const round2 = (n) => Number(Number(n).toFixed(2));

/**
 * Default shipping, used when platform settings carry none.
 *
 * These numbers were hardcoded in the web checkout, the mobile checkout and
 * the mobile pricing util independently. Moving them here makes the server the
 * authority, which is the only way the total it verifies can agree with the
 * total the client shows.
 */
const DEFAULT_SHIPPING_FEE = 200;
const DEFAULT_FREE_SHIPPING_ABOVE = 5000;

/** Shipping on an items subtotal. Free above the threshold. */
function shippingFor(itemsPrice, settings = {}) {
    const fee = settings.shippingFee ?? DEFAULT_SHIPPING_FEE;
    const freeAbove = settings.freeShippingAbove ?? DEFAULT_FREE_SHIPPING_ABOVE;
    if (itemsPrice <= 0) return 0;
    return itemsPrice > freeAbove ? 0 : round2(fee);
}

/**
 * Prices a cart.
 *
 * `lines` is `[{ product, quantity, price }]` where `price` is the DB listing
 * price — the caller looks the products up, because only it knows whether it
 * is pricing an order being placed or one being refunded.
 *
 * `discount` is the already-validated coupon amount in rupees, applied to the
 * items subtotal (never to GST or shipping).
 *
 * Returns both the totals and the per-line breakdown, including `netPrice`:
 * the unit price after this line's share of the discount, which is what the
 * platform actually collected per unit and therefore what settlement must use.
 */
function priceOrder({ lines, settings = {}, discount = 0 }) {
    const gstPct = settings.gstPct ?? 0;

    const priced = lines.map((line) => {
        const unit = Number(line.price) || 0;
        const quantity = Number(line.quantity) || 0;
        return { ...line, unit, quantity, lineTotal: round2(unit * quantity) };
    });

    const itemsPrice = round2(priced.reduce((sum, l) => sum + l.lineTotal, 0));

    // Never more than the goods are worth — a discount larger than the cart
    // would otherwise produce a negative total the gateway cannot charge.
    const appliedDiscount = round2(Math.min(Math.max(Number(discount) || 0, 0), itemsPrice));

    const discountedItems = round2(itemsPrice - appliedDiscount);
    const taxPrice = round2(discountedItems * (gstPct / 100));
    const shippingPrice = shippingFor(itemsPrice, settings);
    const total = round2(discountedItems + taxPrice + shippingPrice);

    // The discount spread across the lines in proportion to their value, so
    // each unit's `netPrice` is what was really collected for it. A whole-order
    // discount cannot be attributed any other way.
    const items = priced.map((line) => {
        const share = itemsPrice > 0 ? round2((line.lineTotal / itemsPrice) * appliedDiscount) : 0;
        const netLine = round2(line.lineTotal - share);
        return {
            product: line.product,
            quantity: line.quantity,
            price: line.unit,
            lineTotal: line.lineTotal,
            discountShare: share,
            netLineTotal: netLine,
            // Per UNIT, which is the grain settlement works at.
            netPrice: line.quantity > 0 ? round2(netLine / line.quantity) : 0,
        };
    });

    return { itemsPrice, discountAmount: appliedDiscount, taxPrice, shippingPrice, total, items };
}

/**
 * How much of the platform's margin a cart contains.
 *
 * A coupon is paid out of the margin and nothing else, so a discount larger
 * than this is the platform paying a customer to shop — and on an
 * investor-funded unit it means paying the investor out of pocket while the
 * ledger still reports a profit. Callers cap the discount at this.
 *
 * `lines` carry `price` (listing) and `vendorPrice` (what the vendor nets).
 */
function marginInCart(lines) {
    return round2(
        lines.reduce((sum, line) => {
            const margin = (Number(line.price) || 0) - (Number(line.vendorPrice) || 0);
            return sum + Math.max(margin, 0) * (Number(line.quantity) || 0);
        }, 0)
    );
}

module.exports = {
    round2,
    DEFAULT_SHIPPING_FEE,
    DEFAULT_FREE_SHIPPING_ABOVE,
    shippingFor,
    priceOrder,
    marginInCart,
};

// Self-check. Run with: node utils/orderTotals.js
if (require.main === module) {
    const assert = require('assert');
    const settings = { gstPct: 18, shippingFee: 200, freeShippingAbove: 5000 };
    const line = (over = {}) => ({ product: 'p1', quantity: 1, price: 120, vendorPrice: 100, ...over });

    // ── The worked example from Phase 10, end to end ─────────────────────
    {
        const q = priceOrder({ lines: [line()], settings });
        assert.strictEqual(q.itemsPrice, 120);
        assert.strictEqual(q.taxPrice, 21.6);
        assert.strictEqual(q.shippingPrice, 200, 'under the free threshold');
        assert.strictEqual(q.total, 341.6);
        assert.strictEqual(q.items[0].netPrice, 120, 'no discount, so net = listed');
    }

    // ── Shipping ─────────────────────────────────────────────────────────
    assert.strictEqual(shippingFor(0, settings), 0, 'an empty cart ships nothing');
    assert.strictEqual(shippingFor(4999, settings), 200);
    assert.strictEqual(shippingFor(5000, settings), 200, 'the threshold is exclusive');
    assert.strictEqual(shippingFor(5001, settings), 0);
    // Defaults apply when settings carry none, so the server still agrees with
    // the historical client behaviour.
    assert.strictEqual(shippingFor(100, {}), DEFAULT_SHIPPING_FEE);
    assert.strictEqual(shippingFor(99999, {}), 0);

    // ── A discount comes off the ITEMS, before GST ───────────────────────
    {
        const q = priceOrder({ lines: [line()], settings, discount: 20 });
        assert.strictEqual(q.discountAmount, 20);
        assert.strictEqual(q.taxPrice, 18, 'GST is charged on 100, not on 120');
        assert.strictEqual(q.total, 318, '100 + 18 + 200');
        // THE line the ledger needs: what was really collected per unit.
        assert.strictEqual(q.items[0].netPrice, 100);
    }

    // Allocated proportionally across lines, so each unit's net is right.
    {
        const q = priceOrder({
            lines: [line({ product: 'a', price: 100 }), line({ product: 'b', price: 300 })],
            settings,
            discount: 40,
        });
        assert.strictEqual(q.itemsPrice, 400);
        assert.strictEqual(q.items[0].discountShare, 10, 'a quarter of the value, a quarter of the discount');
        assert.strictEqual(q.items[1].discountShare, 30);
        assert.strictEqual(q.items[0].netPrice, 90);
        assert.strictEqual(q.items[1].netPrice, 270);
        assert.strictEqual(
            round2(q.items.reduce((s, i) => s + i.discountShare, 0)), 40,
            'the shares add back up to the discount'
        );
    }

    // Quantity: the share is per line, the net is per unit.
    {
        const q = priceOrder({ lines: [line({ quantity: 4 })], settings, discount: 40 });
        assert.strictEqual(q.itemsPrice, 480);
        assert.strictEqual(q.items[0].discountShare, 40);
        assert.strictEqual(q.items[0].netPrice, 110, '(480 - 40) / 4');
    }

    // A discount cannot exceed the cart, or the total goes negative.
    {
        const q = priceOrder({ lines: [line()], settings, discount: 500 });
        assert.strictEqual(q.discountAmount, 120);
        assert.strictEqual(q.total, 200, 'items free, GST nil, shipping still due');
        assert.strictEqual(q.items[0].netPrice, 0);
    }
    assert.strictEqual(priceOrder({ lines: [line()], settings, discount: -5 }).discountAmount, 0);

    // ── Zero rates ───────────────────────────────────────────────────────
    {
        const q = priceOrder({ lines: [line()], settings: { gstPct: 0, shippingFee: 0 } });
        assert.strictEqual(q.total, 120);
        assert.strictEqual(q.taxPrice, 0);
    }
    assert.strictEqual(priceOrder({ lines: [], settings }).total, 0, 'an empty cart is free');

    // ── The margin a coupon may be paid out of ───────────────────────────
    assert.strictEqual(marginInCart([line()]), 20);
    assert.strictEqual(marginInCart([line({ quantity: 3 })]), 60);
    assert.strictEqual(marginInCart([line(), line({ price: 300, vendorPrice: 250 })]), 70);
    // A product with no vendor price (admin-owned stock) is all margin.
    assert.strictEqual(marginInCart([line({ vendorPrice: null })]), 120);
    // Never negative, even if a vendor price somehow exceeds the listing.
    assert.strictEqual(marginInCart([line({ price: 100, vendorPrice: 150 })]), 0);
    assert.strictEqual(marginInCart([]), 0);

    // ── Rounding holds at awkward numbers ────────────────────────────────
    {
        const q = priceOrder({
            lines: [line({ price: 33.33, quantity: 3 })],
            settings,
            discount: 10,
        });
        assert.strictEqual(q.itemsPrice, 99.99);
        assert.ok(Math.abs(q.items[0].netPrice * 3 - (99.99 - 10)) <= 0.02);
    }

    console.log('orderTotals: all checks passed');
}
