/**
 * The scenarios Phases 10 and 20 were specified around, run end-to-end through
 * the real pricing + band + settlement formulas (no database needed — these are
 * the pure money functions both controllers call).
 *
 * Run with: node utils/marginScenarios.test.js
 */

const assert = require('assert');
const { calculateGlobalPricing, calculateUnitProfit, resolveMarginPct } = require('./pricingCalculator');
const {
    DEFAULT_MARGIN_BANDS,
    settlePayout,
    forecastPayout,
    DAY_MS,
} = require('./marginBands');

const MARGIN = { marginPct: 20 };
const BANDS = DEFAULT_MARGIN_BANDS;          // 10d/5%, 15d/10%, 90d/15%
const round2 = (n) => Number(n.toFixed(2));

// A unit of this product funded right now, at today's terms, with the bands
// snapshotted exactly as investmentController does it.
const investAt = (product, bands = BANDS, label = 'low') => ({
    amountInvested: product.investorPrice,
    expectedPayout: forecastPayout(product.investorPrice, bands, label),
    marginBands: bands,
});

// What everyone nets when a unit funded at `investment` terms sells after
// `heldDays`, at the product's current price.
function settle(product, investment, heldDays = 8) {
    const dated = {
        ...investment,
        createdAt: new Date(Date.now() - heldDays * DAY_MS),
        matchedAt: new Date(),
    };
    const { payoutPaid, payoutPct } = settlePayout(dated);

    return {
        vendorGets: product.vendorPrice,
        payoutPaid,
        payoutPct,
        investorProfit: round2(payoutPaid - investment.amountInvested),
        platformProfit: calculateUnitProfit({
            customerPrice: product.price,
            vendorPrice: product.vendorPrice,
            amountInvested: investment.amountInvested,
            payoutPaid,
        }),
    };
}

// --- Scenario 1: vendor lists at 120, nobody's price changes -------------
{
    const product = calculateGlobalPricing(120, MARGIN);

    assert.strictEqual(product.price, 120, 'customer pays the listed price');
    assert.strictEqual(product.vendorPrice, 100, 'vendor nets 100');

    // No investor funded this unit: the platform keeps the whole margin.
    assert.strictEqual(
        calculateUnitProfit({ customerPrice: product.price, vendorPrice: product.vendorPrice }),
        20
    );

    // An investor funded it and it sold in 8 days — the 5% band. They turn 100
    // into 105, and the platform keeps the 15 their short wait did not earn.
    // Before Phase 20 this was 20 to the investor and 0 to the platform.
    const sale = settle(product, investAt(product), 8);
    assert.strictEqual(sale.vendorGets, 100);
    assert.strictEqual(sale.payoutPaid, 105);
    assert.strictEqual(sale.investorProfit, 5);
    assert.strictEqual(sale.platformProfit, 15);
}

// --- Scenario 1b: THE Phase 20 scenario ---------------------------------
// One product, two investors, different waits, different returns. This is the
// behaviour the whole phase exists for.
{
    const product = calculateGlobalPricing(120, MARGIN);
    const bands = BANDS;

    const fast = settle(product, investAt(product, bands), 8);     // low
    const mid = settle(product, investAt(product, bands), 12);     // medium
    const slow = settle(product, investAt(product, bands), 40);    // high

    assert.deepStrictEqual(
        [fast.payoutPaid, mid.payoutPaid, slow.payoutPaid],
        [105, 110, 115]
    );
    assert.deepStrictEqual([fast.payoutPct, mid.payoutPct, slow.payoutPct], [5, 10, 15]);
    // The platform's cut is the mirror image — the margin, less what was earned.
    assert.deepStrictEqual(
        [fast.platformProfit, mid.platformProfit, slow.platformProfit],
        [15, 10, 5]
    );
    // Every one of them paid the same 100 for the same unit of the same
    // product. Only the wait differed.
    assert.strictEqual(product.investorPrice, 100);
    // A longer wait must always pay at least as much.
    assert.ok(fast.payoutPaid <= mid.payoutPaid && mid.payoutPaid <= slow.payoutPaid);
}

// --- Scenario 2: vendor drops the listing price 120 -> 90 ----------------
// A new investor coming in after the drop pays 75, and earns on 75.
{
    const product = calculateGlobalPricing(90, MARGIN);

    assert.strictEqual(product.price, 90, 'customer pays the new lower price');
    assert.strictEqual(product.vendorPrice, 75, 'vendor nets less too');
    assert.strictEqual(product.investorPrice, 75);

    const sale = settle(product, investAt(product), 8);
    assert.strictEqual(sale.payoutPaid, 78.75, '5% of 75');
    assert.strictEqual(sale.investorProfit, 3.75);
    assert.strictEqual(sale.platformProfit, 11.25, 'the 15 margin less the 3.75 earned');
}

// --- Scenario 3: investor bought at 120, THEN the vendor dropped to 90 ---
// The investor is now over-invested, so the difference is refunded and their
// terms are rewritten — exactly what utils/repriceInvestments.js does.
{
    const before = calculateGlobalPricing(120, MARGIN);
    const after = calculateGlobalPricing(90, MARGIN);

    const investment = investAt(before);
    assert.strictEqual(investment.amountInvested, 100);
    assert.strictEqual(investment.expectedPayout, 105, 'forecast at the low band, not 120');

    const refund = round2(investment.amountInvested - after.investorPrice);
    assert.strictEqual(refund, 25, 'refund is 25 — a divide-by-1.2 world, not 28');

    // Apply the reprice. Only the capital is rewritten: the payout follows it
    // automatically now, because it is a percentage of amountInvested rather
    // than a copy of the product's payout field.
    investment.amountInvested = after.investorPrice;

    const sale = settle(after, investment, 8);
    assert.strictEqual(investment.amountInvested, 75);
    assert.strictEqual(sale.payoutPaid, 78.75, 'earns 5% on the 75 still at risk');
    assert.strictEqual(sale.platformProfit, 11.25, 'books still balance after a refund');

    // Net cash for the investor across the whole episode: they paid 100, got
    // 25 back, then received 78.75 — so 3.75 up on the 75 left at risk.
    assert.strictEqual(round2(-100 + refund + sale.payoutPaid), 3.75);
}

// --- Scenario 4: investor bought at 90, THEN the vendor RAISED to 120 ----
// Decision #4: the investor is left alone. Their agreed terms are intact and
// whatever is left over stays with the platform — never a negative.
{
    const before = calculateGlobalPricing(90, MARGIN);
    const after = calculateGlobalPricing(120, MARGIN);

    const investment = investAt(before);          // paid 75
    const refund = round2(investment.amountInvested - after.investorPrice);
    assert.ok(refund < 0, 'nothing owed to the investor on a price rise');

    const sale = settle(after, investment, 8);    // untouched terms
    assert.strictEqual(sale.payoutPaid, 78.75, 'investor still earns 5% on their 75');
    assert.strictEqual(sale.vendorGets, 100, 'vendor is paid at the new price');
    assert.strictEqual(sale.platformProfit, 16.25, 'residual stays with the platform');
    assert.ok(sale.platformProfit >= 0, 'a price rise must never cost the platform');
}

// --- The invariant that matters most -------------------------------------
// At any listing price, any margin and any band, a funded sale must never
// leave the platform out of pocket and must never lose the investor money.
//
// The algebra: platform = P + I − V − I(1+b) = P − V − I·b, and with
// I = V = P/(1+m) that is P·[1 − (1+b)/(1+m)], which is >= 0 exactly when
// b <= m. So the invariant holds precisely BECAUSE bandsError caps every band
// percentage at the product's platform margin — that check is load-bearing,
// not defensive.
{
    for (const marginPct of [0, 5, 20, 33.33, 100]) {
        for (const listing of [1, 90, 120, 999.99, 12345.67]) {
            const product = calculateGlobalPricing(listing, { marginPct });

            // Bands scaled to sit at or under this product's margin, which is
            // the only configuration bandsError will accept.
            const bands = {
                low: { days: 10, pct: marginPct * 0.25 },
                medium: { days: 15, pct: marginPct * 0.5 },
                high: { days: 90, pct: marginPct },
            };

            for (const [heldDays, label] of [[5, 'low'], [12, 'medium'], [200, 'high']]) {
                const sale = settle(product, investAt(product, bands, label), heldDays);

                assert.ok(
                    sale.platformProfit >= -0.01,
                    `platform negative at margin ${marginPct}% / listing ${listing} / ${heldDays}d`
                );
                assert.ok(
                    sale.investorProfit >= 0,
                    `investor lost money at margin ${marginPct}% / listing ${listing} / ${heldDays}d`
                );
            }

            // A band at exactly the margin is the break-even edge: the investor
            // takes the entire margin and the platform books zero, which is the
            // pre-Phase-20 deal reproduced as a special case.
            const atCeiling = settle(
                product,
                investAt(product, { ...bands, high: { days: 90, pct: marginPct } }, 'high'),
                200
            );
            assert.ok(
                Math.abs(atCeiling.platformProfit) <= 0.02,
                `break-even edge off at margin ${marginPct}% / listing ${listing}`
            );
        }
    }
}

// --- Regression: legacy investments keep the deal they were sold ----------
// An investment made before Phase 20 has no `marginBands` snapshot, and its
// expectedPayout was the full listing price. It must settle at that figure and
// never be re-read through a band.
{
    const product = calculateGlobalPricing(120, MARGIN);
    const legacy = { amountInvested: 100, expectedPayout: 120, marginBands: null };

    // Even on a 40-day wait, which would be the 15% band for anyone else.
    const sale = settle(product, legacy, 40);
    assert.strictEqual(sale.payoutPaid, 120, 'the old full-margin deal, honoured');
    assert.strictEqual(sale.investorProfit, 20);
    assert.strictEqual(sale.platformProfit, 0, 'and the platform books zero, as it used to');

    // The wait is irrelevant to a legacy investment — that is the point.
    assert.strictEqual(settle(product, legacy, 1).payoutPaid, 120);
    assert.strictEqual(settle(product, legacy, 999).payoutPaid, 120);
}

// --- Regression: a cancelled order must not re-pool stale terms -----------
// reverseSettlement flips a matched investment back to 'unmatched'. If it
// isn't repriced on the way out, an investment made at 120 and cancelled after
// the vendor dropped to 90 would sit unmatched owing a 120 payout on a 90
// product, and settle the next sale at a loss. orderController calls
// repriceInvestments after re-pooling for exactly this reason.
{
    const after = calculateGlobalPricing(90, MARGIN);
    const stale = { amountInvested: 100, expectedPayout: 120, marginBands: null };

    assert.strictEqual(
        settle(after, stale).platformProfit,
        -5,
        'this is the loss that re-pooling without repricing would cause'
    );

    // After the reprice that reverseSettlement now performs:
    const repriced = { ...stale, amountInvested: after.investorPrice, expectedPayout: 78.75 };
    assert.strictEqual(settle(after, repriced).platformProfit, 11.25);
    assert.strictEqual(settle(after, repriced).investorProfit, 3.75);
}

// --- Regression: raising the margin is what refunds investors -------------
// Easy to get backwards. A BIGGER margin makes listingPrice/(1+margin)
// SMALLER, so existing investors are over-invested and get money back.
{
    const at20 = calculateGlobalPricing(120, { marginPct: 20 });
    const at30 = calculateGlobalPricing(120, { marginPct: 30 });
    const at10 = calculateGlobalPricing(120, { marginPct: 10 });

    assert.ok(at30.investorPrice < at20.investorPrice, 'margin up => investor pays less => refund');
    assert.ok(at10.investorPrice > at20.investorPrice, 'margin down => no refund owed');

    // Customer price never moves when only the margin changes.
    assert.strictEqual(at30.price, at20.price);
    assert.strictEqual(at10.price, at20.price);
}

// --- Regression: a band must never move a price --------------------------
// The Phase 17 bug this phase fixes. The band was the margin then, so putting a
// product in the 5% band repriced the customer from 120 to 105 and cut the
// vendor's net. Pricing takes no band at all now.
{
    const base = calculateGlobalPricing(120, MARGIN);

    for (const pct of [0, 5, 10, 15, 20]) {
        const bands = {
            low: { days: 10, pct },
            medium: { days: 15, pct },
            high: { days: 90, pct },
        };
        const priced = calculateGlobalPricing(120, MARGIN);

        assert.deepStrictEqual(priced, base, `a ${pct}% band moved a price`);
        assert.strictEqual(priced.price, 120, 'customer always pays 120');
        assert.strictEqual(priced.vendorPrice, 100, 'vendor always nets 100');

        // Only the investor's side moves with the band.
        const sale = settle(priced, investAt(priced, bands), 8);
        assert.strictEqual(sale.payoutPaid, round2(100 * (1 + pct / 100)));
        assert.strictEqual(sale.platformProfit, round2(20 - pct));
    }
}

// --- Regression: cart totals must be compared in paise, not as floats -----
// investorPrice is listingPrice/(1+margin) and so is usually fractional.
// Summing those across a cart drifts off the gateway's integer paise, and a
// float `!==` would reject a payment the investor had already been charged.
{
    const a = calculateGlobalPricing(1, MARGIN).investorPrice;    // 0.83
    const b = calculateGlobalPricing(34, MARGIN).investorPrice;   // 28.33
    const cartTotal = a * 2 + b * 3;

    assert.notStrictEqual(cartTotal, 86.65, 'float sum really does drift (this is the trap)');
    assert.strictEqual(Math.round(cartTotal * 100), 8665, 'but paise comparison is exact');
}

// --- Per-product margin override ----------------------------------------
// Admin sets 20% globally but 50% on one product. Both must price correctly,
// and the overridden one must be immune to a later change of the global rate.
{
    const global20 = { marginPct: 20 };
    const global35 = { marginPct: 35 };

    const normal = { marginPct: null };
    const special = { marginPct: 50 };

    const priceWith = (product, settings) =>
        calculateGlobalPricing(120, { marginPct: resolveMarginPct(product, settings) });

    assert.strictEqual(priceWith(normal, global20).vendorPrice, 100, 'follows global 20%');
    assert.strictEqual(priceWith(special, global20).vendorPrice, 80, 'uses its own 50%');

    // Admin now moves the global margin to 35%.
    assert.strictEqual(priceWith(normal, global35).vendorPrice, 88.89, 'follower moves');
    assert.strictEqual(priceWith(special, global35).vendorPrice, 80, 'override does NOT move');

    // A bigger margin is a bigger pot to pay bands out of: the same 15% band
    // on a 50%-margin product leaves the platform much more.
    const s = priceWith(special, global20);                 // investor pays 80
    const sale = settle(s, investAt(s, BANDS, 'high'), 40);
    assert.strictEqual(sale.payoutPaid, 92, '15% of 80');
    assert.strictEqual(sale.investorProfit, 12);
    assert.strictEqual(sale.platformProfit, 28, '40 of margin, less the 12 earned');
}

console.log('marginScenarios: all scenarios + invariants + regressions passed');
