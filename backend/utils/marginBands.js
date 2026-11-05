/**
 * Margin bands — see MARKETPLACE_CONVERSION_PLAN.md Phase 20.
 *
 * A band answers one question: an investor funded a unit, it took N days to
 * sell, what percentage does the investor earn? Three bands per product, set by
 * admin when they approve the listing:
 *
 *   low    sells within 10 days ->  5%    capital back fast, so it earns little
 *   medium sells within 15 days -> 10%
 *   high   slower than that     -> 15%    capital tied up longest, earns most
 *
 * The NAME TRACKS THE PERCENTAGE, NOT THE SPEED. `high` is the slowest band
 * and the best-paying one. This is the opposite of the Phase 16 `marginTier`
 * this file replaces, where `high` meant fastest — the inversion is deliberate
 * and came from the user: "because amount is low 5% only so this category will
 * called low margin category".
 *
 * Two things this is NOT:
 *
 *   • It is not the platform margin. Phase 17 conflated them, so a 5% band
 *     dragged the customer's price down to 105. The platform margin (global, or
 *     product.marginPct) still sets the customer price and the vendor's net on
 *     its own; the band only splits that margin between the investor and the
 *     platform. At 20% margin and a 5% band: customer pays 120, vendor nets
 *     100, investor turns 100 into 105, platform keeps 15.
 *
 *   • It is not a property of the product at payout time. Each investment is
 *     paid on ITS OWN days held (createdAt -> matchedAt), against a snapshot of
 *     the bands taken when it was made. Two investors in the same product can
 *     earn different percentages, and admin editing the rules later cannot
 *     reach an investment that already exists.
 *
 * The product-level label (see labelFor) is a forecast for the investor
 * listing. It decides nobody's money.
 */

const round2 = (n) => Number(n.toFixed(2));

// Ascending in BOTH days and percentage, which is the invariant this file
// guards: a longer wait must never pay less. Order matters — bandFor walks it,
// and labelFor compares positions in it.
const BAND_KEYS = ['low', 'medium', 'high'];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The fallback when a product has no bands of its own. Lives in platform
 * settings (settings.defaultMarginBands) so admin can change it; these are the
 * figures from the brief, and only the shape is relied on here.
 */
const DEFAULT_MARGIN_BANDS = {
    low: { days: 10, pct: 5 },
    medium: { days: 15, pct: 10 },
    high: { days: 90, pct: 15 },
};

/** Strips anything else off a stored subdocument before it goes over the wire. */
function pickBands(bands) {
    return {
        low: { days: Number(bands.low.days), pct: Number(bands.low.pct) },
        medium: { days: Number(bands.medium.days), pct: Number(bands.medium.pct) },
        high: { days: Number(bands.high.days), pct: Number(bands.high.pct) },
    };
}

/**
 * All six numbers or none. A half-filled trio would mix this product's values
 * with the global defaults, which looks like it is working and silently pays
 * the wrong percentage.
 */
function isCompleteBands(bands) {
    return (
        !!bands &&
        BAND_KEYS.every(
            (key) => bands[key] != null && bands[key].days != null && bands[key].pct != null
        )
    );
}

function filledKeys(bands) {
    return BAND_KEYS.filter((key) => {
        const b = bands[key];
        if (!b) return false;
        return (
            (b.days != null && b.days !== '') || (b.pct != null && b.pct !== '')
        );
    });
}

/**
 * Validates admin-submitted bands. Returns an error message or null.
 *
 * `maxPct` is the platform margin % that applies to the product, when the
 * caller knows it. A band paying more than the platform collected would have
 * the platform funding investor returns out of pocket, so it is rejected with
 * that number named — an admin who sees "15% exceeds this product's 12% margin"
 * can act on it, where "invalid percentage" just reads as a bug.
 */
function bandsError(bands, maxPct = 100) {
    if (bands == null) return null;
    if (typeof bands !== 'object' || Array.isArray(bands)) {
        return 'Margin bands must be an object with low, medium and high values';
    }

    const filled = filledKeys(bands);
    if (filled.length === 0) return null;
    if (filled.length !== BAND_KEYS.length || !isCompleteBands(bands)) {
        return 'Set all three margin bands (days and %, for low, medium and high), '
            + 'or leave them all empty to use the platform defaults';
    }

    for (const key of BAND_KEYS) {
        const days = Number(bands[key].days);
        const pct = Number(bands[key].pct);

        if (!Number.isFinite(days) || days < 1) {
            return `The ${key} band's days must be a number, at least 1`;
        }
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
            return `The ${key} band's percentage must be between 0 and 100`;
        }
        if (pct > maxPct) {
            return `The ${key} band pays ${pct}%, which is more than this product's `
                + `${maxPct}% platform margin — the investor's return is paid out of that margin, `
                + `so it cannot exceed it`;
        }
    }

    const n = pickBands(bands);

    // Strict on days, or a band is unreachable: with low.days >= medium.days
    // nothing can ever be medium, and admin finds out weeks later when no
    // product has ever landed there.
    if (!(n.low.days < n.medium.days && n.medium.days < n.high.days)) {
        return 'Margin band days must increase: low < medium < high';
    }

    // Non-strict on percentages, so a flat 10/10/10 is allowed — paying the
    // same whatever the wait is a legitimate choice. Only paying LESS for a
    // longer wait is not, because the whole point of the band is that tied-up
    // capital earns more.
    if (!(n.low.pct <= n.medium.pct && n.medium.pct <= n.high.pct)) {
        return 'Margin band percentages cannot decrease: a longer wait must not pay less';
    }

    return null;
}

/**
 * Normalises submitted bands for storage. Empty/absent becomes explicit nulls,
 * which is what "use the platform defaults" is stored as. Call only after
 * bandsError() has passed.
 */
function normaliseBands(bands) {
    if (!isCompleteBands(bands)) {
        return {
            low: { days: null, pct: null },
            medium: { days: null, pct: null },
            high: { days: null, pct: null },
        };
    }
    return pickBands(bands);
}

/**
 * The bands that apply to a product: its own, else the platform defaults.
 *
 * One level of fallback, deliberately. Phase 16 walked a category inheritance
 * chain here; the rules are per-product now (iPhone 15 and iPhone 14 are both
 * phones and want different numbers), so there is nothing to walk.
 */
function resolveBands(product, settings) {
    if (isCompleteBands(product?.marginBands)) return pickBands(product.marginBands);
    if (isCompleteBands(settings?.defaultMarginBands)) return pickBands(settings.defaultMarginBands);
    return DEFAULT_MARGIN_BANDS;
}

/** Which band a wait of `days` falls into. */
function bandFor(days, bands) {
    if (days <= bands.low.days) return 'low';
    if (days <= bands.medium.days) return 'medium';
    // `high.days` is the outer edge admin expects to type, not a cutoff. A unit
    // slower than it has nowhere higher to go, so it stays high rather than
    // inventing a fourth band or falling off the end unpaid.
    return 'high';
}

/** The percentage a wait of `days` earns. */
function pctFor(days, bands) {
    return bands[bandFor(days, bands)].pct;
}

/** Days between investing and the unit selling. The clock the payout runs on. */
function daysHeld(investment, matchedAt = investment.matchedAt) {
    if (!matchedAt || !investment.createdAt) return null;
    return (new Date(matchedAt) - new Date(investment.createdAt)) / DAY_MS;
}

/**
 * What an investor is actually paid when their unit sells.
 *
 * `investment.marginBands` is the snapshot taken at invest time. Null means the
 * investment predates Phase 20, when the deal was the full listing price and
 * `expectedPayout` was a contract rather than a forecast — those settle at the
 * figure they were sold, untouched, forever. That null IS the grandfather
 * check, which is why no migration script exists.
 */
function settlePayout(investment, matchedAt = investment.matchedAt) {
    if (!isCompleteBands(investment.marginBands)) {
        const paid = round2(investment.expectedPayout);
        const invested = Number(investment.amountInvested) || 0;
        return {
            payoutPaid: paid,
            // Back-derived so the ledger reads the same shape for both deals.
            payoutPct: invested > 0 ? round2(((paid - invested) / invested) * 100) : 0,
            legacy: true,
        };
    }

    const bands = pickBands(investment.marginBands);
    // A unit that somehow has no matchedAt is being settled right now, so it
    // has been held zero days — the fastest, cheapest band. Never null, because
    // this function's only job is to produce a number money moves on.
    const held = daysHeld(investment, matchedAt) ?? 0;
    const pct = pctFor(Math.max(held, 0), bands);

    return {
        payoutPct: pct,
        payoutPaid: round2(Number(investment.amountInvested) * (1 + pct / 100)),
        legacy: false,
    };
}

/**
 * The band label shown on a product. A forecast, not a payout: it is what
 * investors shop and filter by, and it moves as evidence arrives.
 *
 *   sold something -> the band its average observed wait falls into
 *   sold nothing   -> admin's pick at approval, but the running clock since
 *                     go-live can only move it UP
 *
 * The one-way clock is the part worth explaining. A listing sitting unsold for
 * four months IS a high-margin product by its own rules, and an investor can
 * check the listing date — so letting it keep advertising "low, sells in 10
 * days" would be a lie they can catch. Moving it up is honest. Moving it below
 * admin's pick on no evidence at all is not, so that direction is closed.
 *
 * Derived on read, never stored: it is two fields and an average, so storing it
 * would only add a staleness bug.
 */
function labelFor({ bands, adminPick = null, observedDays = [], liveAt = null, now = Date.now() }) {
    if (observedDays.length > 0) {
        const avg = observedDays.reduce((sum, d) => sum + d, 0) / observedDays.length;
        return bandFor(Math.max(avg, 0), bands);
    }

    const pick = BAND_KEYS.includes(adminPick) ? adminPick : 'low';
    if (!liveAt) return pick;

    const elapsed = (now - new Date(liveAt)) / DAY_MS;
    const byClock = bandFor(Math.max(elapsed, 0), bands);

    return BAND_KEYS.indexOf(byClock) > BAND_KEYS.indexOf(pick) ? byClock : pick;
}

/**
 * The three payouts an investor could receive on `investorPrice`, so the
 * listing can show the real range instead of one number.
 *
 * A single "you receive ₹X" would be a guess presented as a fact — the return
 * genuinely depends on how long the unit takes to sell, and that is the one
 * thing the investor is being asked to judge.
 */
function payoutRange(investorPrice, bands) {
    const base = Number(investorPrice) || 0;
    return BAND_KEYS.map((key) => ({
        band: key,
        days: bands[key].days,
        pct: bands[key].pct,
        payout: round2(base * (1 + bands[key].pct / 100)),
    }));
}

/**
 * `productId -> [days held, ...]` for every unit that has actually sold, which
 * is the evidence labelFor prefers over admin's guess.
 *
 * The model is required lazily so everything above this line stays pure and the
 * self-check runs without a database.
 */
async function observedDaysByProduct(productIds) {
    if (!productIds || productIds.length === 0) return new Map();
    const Investment = require('../models/investmentModel');

    const rows = await Investment.find(
        { product: { $in: productIds }, status: 'matched', matchedAt: { $ne: null } },
        'product createdAt matchedAt'
    ).lean();

    const out = new Map();
    for (const row of rows) {
        const held = daysHeld(row);
        if (held == null) continue;
        const key = String(row.product);
        if (!out.has(key)) out.set(key, []);
        out.get(key).push(Math.max(held, 0));
    }
    return out;
}

/**
 * One query for the whole page, then in-memory resolution — the same shape the
 * Phase 16 category resolver had, minus the inheritance walk it needed.
 *
 * Returns `(product) => { marginBands, marginCategory, marginBandPct,
 * investorPayout, payoutRange, observedSales }`, where `marginCategory` is the
 * resolved label (admin's pick, the running clock, or observed sales) rather
 * than the raw stored field.
 */
async function buildBandResolver(products, settings) {
    const observed = await observedDaysByProduct(products.map((p) => p._id));

    return function resolve(product) {
        const bands = resolveBands(product, settings);
        const observedDays = observed.get(String(product._id)) || [];
        const label = labelFor({
            bands,
            adminPick: product.marginCategory,
            observedDays,
            liveAt: product.liveAt,
        });

        return {
            marginBands: bands,
            marginCategory: label,
            marginBandPct: bands[label].pct,
            investorPayout: forecastPayout(product.investorPrice, bands, label),
            payoutRange: payoutRange(product.investorPrice, bands),
            observedSales: observedDays.length,
        };
    };
}

/**
 * The single payout figure stored on a product (`investorPayout`) and on a new
 * investment (`expectedPayout`): what this unit pays if it sells inside the
 * product's current band.
 *
 * A forecast, and the only honest way to reduce three numbers to one. Anywhere
 * there is room to show the spread, send payoutRange() instead.
 */
function forecastPayout(investorPrice, bands, label) {
    const band = BAND_KEYS.includes(label) ? label : 'low';
    return round2((Number(investorPrice) || 0) * (1 + bands[band].pct / 100));
}

module.exports = {
    BAND_KEYS,
    forecastPayout,
    observedDaysByProduct,
    buildBandResolver,
    DAY_MS,
    DEFAULT_MARGIN_BANDS,
    isCompleteBands,
    bandsError,
    normaliseBands,
    resolveBands,
    bandFor,
    pctFor,
    daysHeld,
    settlePayout,
    labelFor,
    payoutRange,
};

// Self-check for the worked example in MARKETPLACE_CONVERSION_PLAN.md Phase 20.
// Run with: node utils/marginBands.js
if (require.main === module) {
    const assert = require('assert');
    const bands = DEFAULT_MARGIN_BANDS;
    const day = (n) => new Date(Date.now() - n * DAY_MS);

    // ── The brief's worked example, end to end ───────────────────────────
    //
    // Vendor lists so they net 100 at a 20% platform margin -> customer 120,
    // investor pays 100. What the investor GETS depends only on the wait.
    const { calculateGlobalPricing } = require('./pricingCalculator');
    const derived = calculateGlobalPricing(120, { marginPct: 20 });
    assert.strictEqual(derived.vendorPrice, 100);
    assert.strictEqual(derived.investorPrice, 100);

    for (const [held, expectedPct, expectedPayout, platformKeeps] of [
        [8, 5, 105, 15],
        [12, 10, 110, 10],
        [40, 15, 115, 5],
    ]) {
        const investment = {
            amountInvested: derived.investorPrice,
            marginBands: bands,
            createdAt: day(held),
            matchedAt: new Date(),
        };
        const { payoutPct, payoutPaid } = settlePayout(investment);
        assert.strictEqual(payoutPct, expectedPct, `pct at ${held} days`);
        assert.strictEqual(payoutPaid, expectedPayout, `payout at ${held} days`);
        // The platform keeps the margin it collected, less the investor's cut.
        assert.strictEqual(
            round2(derived.price + investment.amountInvested - derived.vendorPrice - payoutPaid),
            platformKeeps,
            `platform cut at ${held} days`
        );
    }

    // ── Band boundaries ──────────────────────────────────────────────────
    //
    // Each `days` is the inclusive outer edge of its band.
    assert.strictEqual(bandFor(0, bands), 'low');
    assert.strictEqual(bandFor(10, bands), 'low');
    assert.strictEqual(bandFor(10.1, bands), 'medium');
    assert.strictEqual(bandFor(15, bands), 'medium');
    assert.strictEqual(bandFor(15.1, bands), 'high');
    assert.strictEqual(bandFor(90, bands), 'high');
    // Nothing falls off the slow end — a year-old unit still pays the high band.
    assert.strictEqual(bandFor(365, bands), 'high');
    assert.strictEqual(pctFor(365, bands), 15);

    // ── The label is a forecast, and moves only on honest evidence ───────
    //
    // Nothing sold, listed yesterday: admin's pick stands, whatever it is.
    assert.strictEqual(labelFor({ bands, adminPick: 'high', liveAt: day(1) }), 'high');
    assert.strictEqual(labelFor({ bands, adminPick: 'low', liveAt: day(1) }), 'low');
    // Nothing sold in 40 days: the clock overtakes a 'low' pick...
    assert.strictEqual(labelFor({ bands, adminPick: 'low', liveAt: day(40) }), 'high');
    // ...but never drags a pick DOWN. 2 days elapsed is 'low' by the clock, and
    // admin's 'high' pick survives it.
    assert.strictEqual(labelFor({ bands, adminPick: 'high', liveAt: day(2) }), 'high');
    // Observed sales win outright, in both directions.
    assert.strictEqual(labelFor({ bands, adminPick: 'high', observedDays: [3], liveAt: day(99) }), 'low');
    assert.strictEqual(labelFor({ bands, adminPick: 'low', observedDays: [50], liveAt: day(1) }), 'high');
    // Averaged, not last-write-wins: 8 and 20 days average to 14 -> medium.
    assert.strictEqual(labelFor({ bands, observedDays: [8, 20], liveAt: day(30) }), 'medium');
    // No pick and no clock is the floor, not a crash.
    assert.strictEqual(labelFor({ bands }), 'low');

    // ── Legacy investments keep the deal they were sold ──────────────────
    //
    // Pre-Phase-20: no snapshot, and expectedPayout was the full listing price.
    const legacy = {
        amountInvested: 100,
        expectedPayout: 120,
        marginBands: null,
        createdAt: day(40),
        matchedAt: new Date(),
    };
    const settled = settlePayout(legacy);
    assert.strictEqual(settled.payoutPaid, 120, 'legacy pays what it promised');
    assert.strictEqual(settled.payoutPct, 20);
    assert.ok(settled.legacy);
    // A half-filled snapshot is treated as legacy too, never as "some bands".
    assert.strictEqual(
        settlePayout({ ...legacy, marginBands: { low: { days: 10, pct: 5 } } }).payoutPaid,
        120
    );

    // The snapshot is what pays, so admin editing the product later cannot
    // reach an existing investment — that is the whole point of storing it.
    const snapshotted = {
        amountInvested: 100,
        marginBands: { low: { days: 5, pct: 2 }, medium: { days: 9, pct: 4 }, high: { days: 20, pct: 6 } },
        createdAt: day(8),
        matchedAt: new Date(),
    };
    assert.strictEqual(settlePayout(snapshotted).payoutPct, 4, 'settles on its own snapshot');
    assert.strictEqual(pctFor(8, bands), 5, 'and not on the current platform defaults');

    // ── resolveBands: one level of fallback ──────────────────────────────
    const custom = { low: { days: 2, pct: 1 }, medium: { days: 4, pct: 2 }, high: { days: 6, pct: 3 } };
    assert.deepStrictEqual(resolveBands({ marginBands: custom }, {}), custom);
    assert.deepStrictEqual(resolveBands({}, { defaultMarginBands: custom }), custom);
    assert.deepStrictEqual(resolveBands({}, {}), DEFAULT_MARGIN_BANDS);
    // A product's partial bands fall through rather than merging.
    assert.deepStrictEqual(
        resolveBands({ marginBands: { low: { days: 1, pct: 1 } } }, { defaultMarginBands: custom }),
        custom
    );

    // ── Validation ───────────────────────────────────────────────────────
    assert.strictEqual(bandsError(null), null, 'absent = use defaults');
    assert.strictEqual(bandsError({}), null, 'empty = use defaults');
    assert.strictEqual(bandsError(bands), null);
    // Flat percentages are legal: same pay whatever the wait.
    assert.strictEqual(
        bandsError({ low: { days: 1, pct: 10 }, medium: { days: 2, pct: 10 }, high: { days: 3, pct: 10 } }),
        null
    );
    // A longer wait paying less is not.
    assert.ok(
        bandsError({ low: { days: 1, pct: 10 }, medium: { days: 2, pct: 5 }, high: { days: 3, pct: 15 } })
            ?.includes('must not pay less')
    );
    // Days must increase strictly, or a band is unreachable.
    assert.ok(
        bandsError({ low: { days: 10, pct: 5 }, medium: { days: 10, pct: 10 }, high: { days: 20, pct: 15 } })
            ?.includes('must increase')
    );
    assert.ok(
        bandsError({ low: { days: 30, pct: 5 }, medium: { days: 20, pct: 10 }, high: { days: 10, pct: 15 } })
            ?.includes('must increase')
    );
    // Half-filled is rejected rather than silently merged.
    assert.ok(bandsError({ low: { days: 10, pct: 5 } })?.includes('all three'));
    assert.ok(
        bandsError({ low: { days: 10 }, medium: { days: 15, pct: 10 }, high: { days: 90, pct: 15 } })
            ?.includes('all three')
    );
    // Out-of-range numbers.
    assert.ok(bandsError({ ...bands, low: { days: 0, pct: 5 } })?.includes('at least 1'));
    assert.ok(bandsError({ ...bands, low: { days: 10, pct: -1 } })?.includes('between 0 and 100'));
    assert.ok(bandsError({ ...bands, high: { days: 90, pct: 101 } })?.includes('between 0 and 100'));
    assert.ok(bandsError('nope')?.includes('must be an object'));
    // The platform margin is the ceiling: the investor's return comes out of it.
    assert.strictEqual(bandsError(bands, 20), null, '15% fits inside a 20% margin');
    assert.strictEqual(bandsError(bands, 15), null, 'exactly equal is allowed');
    assert.ok(bandsError(bands, 12)?.includes("12% platform margin"));
    // 0% margin means nothing can be paid out, which the ceiling catches.
    assert.ok(bandsError(bands, 0));

    // ── normaliseBands ───────────────────────────────────────────────────
    assert.deepStrictEqual(normaliseBands(bands), bands);
    assert.deepStrictEqual(normaliseBands({}), {
        low: { days: null, pct: null },
        medium: { days: null, pct: null },
        high: { days: null, pct: null },
    });
    // Strings off a form body become numbers, so nothing downstream compares
    // "10" to 10.
    assert.deepStrictEqual(
        normaliseBands({
            low: { days: '10', pct: '5' },
            medium: { days: '15', pct: '10' },
            high: { days: '90', pct: '15' },
        }),
        bands
    );

    // ── payoutRange: the listing shows the range, not a guess ────────────
    assert.deepStrictEqual(payoutRange(100, bands), [
        { band: 'low', days: 10, pct: 5, payout: 105 },
        { band: 'medium', days: 15, pct: 10, payout: 110 },
        { band: 'high', days: 90, pct: 15, payout: 115 },
    ]);
    assert.deepStrictEqual(payoutRange(0, bands).map((r) => r.payout), [0, 0, 0]);

    // forecastPayout is one row out of that range, by label.
    assert.strictEqual(forecastPayout(100, bands, 'low'), 105);
    assert.strictEqual(forecastPayout(100, bands, 'medium'), 110);
    assert.strictEqual(forecastPayout(100, bands, 'high'), 115);
    // An unset or junk label forecasts the floor rather than throwing — a
    // product awaiting approval has no band yet and still renders.
    assert.strictEqual(forecastPayout(100, bands, null), 105);
    assert.strictEqual(forecastPayout(100, bands, 'stalled'), 105);

    // ── daysHeld ─────────────────────────────────────────────────────────
    assert.strictEqual(daysHeld({ createdAt: day(10), matchedAt: new Date() }).toFixed(0), '10');
    assert.strictEqual(daysHeld({ createdAt: day(10), matchedAt: null }), null);
    // Unmatched settles at zero days held rather than throwing.
    assert.strictEqual(
        settlePayout({ amountInvested: 100, marginBands: bands, createdAt: day(40), matchedAt: null })
            .payoutPct,
        5
    );

    console.log('marginBands: all checks passed');
}
