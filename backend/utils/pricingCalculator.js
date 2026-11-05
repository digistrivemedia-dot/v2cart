// Shared formula for deriving every price on a product from the one number
// the vendor types (their listing price) and the one margin %.
// See MARKETPLACE_CONVERSION_PLAN.md Phase 10, amended by Phase 20.
//
// The margin is carved OUT OF the listing price, not added on top of a cost:
//
//   f              = 1 + marginPct/100
//   price          = P        customer pays exactly what the vendor listed
//   vendorPrice    = P / f    what the vendor receives
//   investorPrice  = P / f    what an investor pays (same as the vendor's net)
//
// What the investor RECEIVES is deliberately not here. Until Phase 20 it was
// `P`, so the investor earned the whole margin and the platform netted zero on
// a funded unit. The investor's return is now a slice of that margin sized by
// how long their unit took to sell, and it lives in utils/marginBands.js — the
// platform keeps `marginPct − bandPct`. This file therefore knows about the
// margin and nothing about bands, which is why a band can never move a
// customer's price or a vendor's net.
const round2 = (n) => Number(n.toFixed(2));

// Which margin applies to a product: its own override, else the global rate.
//
// `??` rather than `||` is deliberate, so an explicit 0% override is honoured
// instead of silently falling through to the global rate.
//
// Phase 17 wedged a third level in here — the margin % a product CATEGORY
// charged on its current tier, which outranked both of these. Phase 20 removed
// it rather than reordering it: the band is no longer a margin, so there is
// nothing left for it to outrank and the question of precedence disappears.
function resolveMarginPct(product, settings) {
    return product?.marginPct ?? settings.marginPct;
}

// `settings` only needs a `marginPct` — pass the global settings doc, or
// `{ marginPct: resolveMarginPct(product, settings) }` to price one product
// against its own override.
//
// Returns no `investorPayout`: that depends on the product's margin bands, not
// on the margin, so callers derive it with marginBands.forecastPayout().
function calculateGlobalPricing(listingPrice, settings) {
    const price = round2(listingPrice);
    const vendorNet = round2(listingPrice / (1 + settings.marginPct / 100));

    return {
        price,
        vendorPrice: vendorNet,
        investorPrice: vendorNet,
    };
}

// The platform's cut of one sold unit. Lives here next to the pricing it has
// to agree with, and is used by orderController's settlement.
//
// Everything the platform holds minus everything it owes: it received the
// customer's payment plus (earlier) the investor's capital, and it owes the
// vendor their net plus the investor their payout.
//
// Pass the payout that was ACTUALLY paid (marginBands.settlePayout), not a
// forecast. On a funded unit the result is `marginPct − bandPct` of the vendor
// net — the slice of the margin the investor's wait did not earn. On an
// unfunded unit it is the full margin. Before Phase 20 it was always 0 on a
// funded unit, because the investor took the whole margin.
function calculateUnitProfit({ customerPrice, vendorPrice, amountInvested = 0, payoutPaid = 0 }) {
    return round2(customerPrice + amountInvested - vendorPrice - payoutPaid);
}

// The inverse of `vendorPrice`: what to list a product at so the vendor nets
// a given amount. The vendor product form asks for the vendor's own price and
// submits the listing price, so this is the conversion that sits between the
// two — and it lives here so it can't disagree with the formula above.
//
//   listingPrice = net * (1 + marginPct/100)
//
// Rounded to paise, so net -> listing -> net round-trips to within ₹0.01. The
// stored listing price is authoritative; the vendor's net is always re-derived
// from it by calculateGlobalPricing, never kept as a separate truth.
function listingPriceFromVendorNet(vendorNet, settings) {
    return round2(Number(vendorNet) * (1 + settings.marginPct / 100));
}

// What the customer is charged, GST included. GST is added ON TOP of the
// listing price — unlike the margin, which is carved out of it — and none of
// it belongs to the platform, the vendor or the investor.
function calculateCustomerTotal(listingPrice, settings) {
    const price = round2(Number(listingPrice));
    const gst = round2(price * (settings.gstPct / 100));

    return { price, gst, total: round2(price + gst) };
}

module.exports = {
    calculateGlobalPricing,
    calculateUnitProfit,
    resolveMarginPct,
    listingPriceFromVendorNet,
    calculateCustomerTotal,
};

// Self-check for the worked examples in MARKETPLACE_CONVERSION_PLAN.md.
// Run with: node utils/pricingCalculator.js
if (require.main === module) {
    const assert = require('assert');
    const settings = { marginPct: 20 };

    const at120 = calculateGlobalPricing(120, settings);
    assert.deepStrictEqual(at120, { price: 120, vendorPrice: 100, investorPrice: 100 });

    const at90 = calculateGlobalPricing(90, settings);
    assert.deepStrictEqual(at90, { price: 90, vendorPrice: 75, investorPrice: 75 });

    // The investor pays the vendor's net at any listing price, to within the
    // one-paisa rounding residue (at ₹1 that residue is 0.48% of a tiny
    // number — real, unavoidable at 2dp, and absorbed by the platform).
    for (const p of [120, 90, 1, 3333.33]) {
        const q = calculateGlobalPricing(p, settings);
        assert.ok(Math.abs(q.investorPrice - p / 1.2) <= 0.01, `off at listing price ${p}`);
    }

    // The margin the platform collects on a unit, which is the pot the
    // investor's band percentage is paid out of (see utils/marginBands.js).
    assert.strictEqual(at120.price - at120.vendorPrice, 20);

    // A price drop refunds the investor the difference between the old and new
    // investor price — 120 -> 90 gives back 25, not 28.
    assert.strictEqual(round2(at120.investorPrice - at90.investorPrice), 25);

    // Margin 0 is legal and degenerate: nobody takes a cut, and no band can
    // pay anything (bandsError rejects any pct above the margin).
    assert.deepStrictEqual(
        calculateGlobalPricing(100, { marginPct: 0 }),
        { price: 100, vendorPrice: 100, investorPrice: 100 }
    );

    // A per-product override wins over the global margin; null follows it.
    assert.strictEqual(resolveMarginPct({ marginPct: 35 }, settings), 35);
    assert.strictEqual(resolveMarginPct({ marginPct: null }, settings), 20);
    assert.strictEqual(resolveMarginPct({}, settings), 20);
    assert.strictEqual(resolveMarginPct(null, settings), 20);
    // An explicit 0% override must NOT fall through to the global rate.
    assert.strictEqual(resolveMarginPct({ marginPct: 0 }, settings), 0);

    // Phase 17's third level is gone, not reordered: extra arguments are
    // ignored rather than quietly outranking the override. This is the
    // assertion that fails if anyone reintroduces a category tier % here.
    assert.strictEqual(resolveMarginPct({ marginPct: 35 }, settings, 30), 35);
    assert.strictEqual(resolveMarginPct({}, settings, 30), 20);

    // Two products, same listing price, different margins.
    const overridden = calculateGlobalPricing(120, { marginPct: resolveMarginPct({ marginPct: 50 }, settings) });
    assert.deepStrictEqual(overridden, { price: 120, vendorPrice: 80, investorPrice: 80 });
    assert.strictEqual(at120.vendorPrice, 100, 'the global-margin product is unaffected');

    // ── A band must never move a price ───────────────────────────────────
    //
    // The regression Phase 20 exists to prevent: under Phase 17 the band WAS
    // the margin, so dropping a product to the 5% band repriced the customer
    // from 120 to 105. Pricing no longer takes a band at all, which is what
    // makes this hold by construction.
    {
        const { settlePayout, DEFAULT_MARGIN_BANDS } = require('./marginBands');
        const base = calculateGlobalPricing(120, { marginPct: resolveMarginPct({}, settings) });
        for (const held of [1, 8, 12, 40, 400]) {
            const priced = calculateGlobalPricing(120, { marginPct: resolveMarginPct({}, settings) });
            assert.deepStrictEqual(priced, base, `band at ${held} days moved a price`);
            // ...while the investor's payout genuinely does move with the wait.
            const { payoutPaid } = settlePayout({
                amountInvested: base.investorPrice,
                marginBands: DEFAULT_MARGIN_BANDS,
                createdAt: new Date(Date.now() - held * 86400000),
                matchedAt: new Date(),
            });
            // And the platform's cut is whatever the band did not take.
            assert.ok(
                calculateUnitProfit({
                    customerPrice: base.price,
                    vendorPrice: base.vendorPrice,
                    amountInvested: base.investorPrice,
                    payoutPaid,
                }) >= 0,
                `platform went negative at ${held} days`
            );
        }

        // The brief's three cases, as profit: 5% band leaves 15, 15% leaves 5.
        for (const [held, keeps] of [[8, 15], [12, 10], [40, 5]]) {
            const { payoutPaid } = settlePayout({
                amountInvested: 100,
                marginBands: DEFAULT_MARGIN_BANDS,
                createdAt: new Date(Date.now() - held * 86400000),
                matchedAt: new Date(),
            });
            assert.strictEqual(
                calculateUnitProfit({
                    customerPrice: 120, vendorPrice: 100, amountInvested: 100, payoutPaid,
                }),
                keeps,
                `platform cut at ${held} days`
            );
        }

        // An unfunded unit still leaves the platform the whole margin.
        assert.strictEqual(
            calculateUnitProfit({ customerPrice: 120, vendorPrice: 100 }),
            20
        );
    }

    // ── The vendor form's inversion ──────────────────────────────────────
    //
    // The form asks for the vendor's own price and submits the listing price,
    // so the two directions have to agree or a vendor's net silently drifts
    // from what the form promised them.
    assert.strictEqual(listingPriceFromVendorNet(100, settings), 120);
    assert.strictEqual(listingPriceFromVendorNet(75, settings), 90);
    assert.strictEqual(listingPriceFromVendorNet(100, { marginPct: 0 }), 100);
    assert.strictEqual(listingPriceFromVendorNet(0, settings), 0);

    // Round-trip: whatever the vendor types, the net derived back out of the
    // listing price must be the number they were shown, to the paisa.
    for (const net of [100, 75, 1, 0.07, 999.99, 3333.33, 12345.67]) {
        for (const m of [0, 5, 7, 18, 20, 33.33, 50, 100]) {
            const cfg = { marginPct: m };
            const listing = listingPriceFromVendorNet(net, cfg);
            const back = calculateGlobalPricing(listing, cfg).vendorPrice;
            assert.ok(
                Math.abs(back - net) <= 0.01,
                `net ${net} at ${m}%: listed ${listing}, netted back ${back}`
            );
        }
    }

    // The platform's cut is the difference, and it is what the form shows.
    {
        const listing = listingPriceFromVendorNet(100, settings);
        const derived = calculateGlobalPricing(listing, settings);
        assert.strictEqual(round2(listing - derived.vendorPrice), 20);
        assert.strictEqual(derived.investorPrice, 100, 'investor pays the vendor net');
    }

    // ── GST ──────────────────────────────────────────────────────────────
    //
    // Added on top, so it must not change anyone's cut.
    assert.deepStrictEqual(
        calculateCustomerTotal(120, { gstPct: 18 }),
        { price: 120, gst: 21.6, total: 141.6 }
    );
    assert.deepStrictEqual(
        calculateCustomerTotal(100, { gstPct: 0 }),
        { price: 100, gst: 0, total: 100 }
    );
    assert.deepStrictEqual(
        calculateCustomerTotal(90, { gstPct: 5 }),
        { price: 90, gst: 4.5, total: 94.5 }
    );
    // The full worked example end to end: vendor types 100 at 20% margin and
    // 18% GST.
    {
        const listing = listingPriceFromVendorNet(100, { marginPct: 20 });
        const derived = calculateGlobalPricing(listing, { marginPct: 20 });
        const customer = calculateCustomerTotal(listing, { gstPct: 18 });
        assert.strictEqual(derived.vendorPrice, 100, 'vendor receives what they typed');
        assert.strictEqual(listing, 120, 'listed to customers at 120');
        assert.strictEqual(customer.total, 141.6, 'customer pays 141.60 with GST');
        assert.strictEqual(derived.investorPrice, 100, 'investor pays 100');
        // What they RECEIVE is the band's business, not this file's — 105, 110
        // or 115 depending on the wait. See utils/marginBands.js.
    }

    console.log('pricingCalculator: all checks passed');
}
