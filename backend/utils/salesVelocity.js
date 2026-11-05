/**
 * How fast products are actually selling.
 *
 * Lifted out of productController.getInvestorProducts (Phase 11) when Phase 17
 * made pricing depend on the same figures: the investor listing needs the
 * weekly series for its sparkline, and the margin-category pricing needs the
 * velocity those weeks imply. One aggregation serves both rather than two
 * queries that could drift apart on the window constants.
 */

const Order = require('../models/orderModel');

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

// How much sales history to look back over, and how much of it counts as
// "recent" for the headline velocity figure.
const SALES_WINDOW_WEEKS = 12;
const RECENT_WEEKS = 4;

function emptySeries() {
    return new Array(SALES_WINDOW_WEEKS).fill(0);
}

/** The zero row, for a product with no sales at all in the window. */
function emptyVelocity() {
    return {
        salesByWeek: emptySeries(),
        unitsSoldRecent: 0,
        unitsSoldWindow: 0,
        salesWindowWeeks: SALES_WINDOW_WEEKS,
        recentWeeks: RECENT_WEEKS,
        velocityPerWeek: 0,
        daysToSellOneUnit: null,
        hasEverSold: false,
    };
}

/**
 * Derives the rate figures from a weekly series. Kept separate and pure so the
 * velocity rule is checkable, and so it reads identically to
 * deriveInvestorMetrics in tilesecommerse/src/lib/investor/metrics.ts.
 */
function summariseWeekly(weekly) {
    const unitsSoldWindow = weekly.reduce((sum, n) => sum + n, 0);
    const unitsSoldRecent = weekly.slice(-RECENT_WEEKS).reduce((sum, n) => sum + n, 0);

    // Prefer the recent window so a product that just started moving isn't
    // dragged down by 8 dead weeks; fall back to the full window when the
    // recent one is empty but there is older history to go on.
    const velocityPerWeek =
        unitsSoldRecent > 0
            ? unitsSoldRecent / RECENT_WEEKS
            : unitsSoldWindow > 0
                ? unitsSoldWindow / SALES_WINDOW_WEEKS
                : 0;

    return {
        salesByWeek: weekly,
        unitsSoldRecent,
        unitsSoldWindow,
        salesWindowWeeks: SALES_WINDOW_WEEKS,
        recentWeeks: RECENT_WEEKS,
        velocityPerWeek,
        // Days for ONE unit to sell at this rate — the margin category is
        // classified from this, NOT from an investor's queue position, so the
        // tier is a property of the product and reads the same for everyone.
        // No velocity means no honest estimate: null, never 0 or Infinity.
        daysToSellOneUnit:
            velocityPerWeek > 0 ? Number((7 / velocityPerWeek).toFixed(1)) : null,
        // Only orders are visible here, so this is "sold inside the window".
        // The client refines it with investment history to tell `stalled` from
        // `untested`; that distinction changes the label, never the price,
        // since neither tier carries a margin %.
        hasEverSold: unitsSoldWindow > 0,
    };
}

/**
 * `productIds -> velocity row`, for products with any sales in the window.
 * Callers use emptyVelocity() for the rest.
 */
async function getSalesVelocity(productIds) {
    if (!productIds || productIds.length === 0) return new Map();

    const rows = await Order.aggregate([
        {
            $match: {
                orderStatus: { $ne: 'Cancelled' },
                createdAt: { $gte: new Date(Date.now() - SALES_WINDOW_WEEKS * WEEK_MS) },
            },
        },
        { $unwind: '$orderItems' },
        { $match: { 'orderItems.product': { $in: productIds } } },
        {
            // Bucket by whole weeks back from now. Done with arithmetic rather
            // than $dateTrunc so it works on older MongoDB too.
            $addFields: {
                weeksAgo: {
                    $floor: {
                        $divide: [{ $subtract: [new Date(), '$createdAt'] }, WEEK_MS],
                    },
                },
            },
        },
        {
            $group: {
                _id: { product: '$orderItems.product', weeksAgo: '$weeksAgo' },
                units: { $sum: '$orderItems.quantity' },
            },
        },
    ]);

    // product id -> number[SALES_WINDOW_WEEKS], oldest week first so the
    // sparkline reads left-to-right like every other time axis.
    const weeklyByProduct = new Map();
    for (const row of rows) {
        const key = String(row._id.product);
        const weeksAgo = Number(row._id.weeksAgo);
        if (weeksAgo < 0 || weeksAgo >= SALES_WINDOW_WEEKS) continue;
        if (!weeklyByProduct.has(key)) weeklyByProduct.set(key, emptySeries());
        weeklyByProduct.get(key)[SALES_WINDOW_WEEKS - 1 - weeksAgo] += row.units;
    }

    const out = new Map();
    for (const [key, weekly] of weeklyByProduct) {
        out.set(key, summariseWeekly(weekly));
    }
    return out;
}

module.exports = {
    DAY_MS,
    WEEK_MS,
    SALES_WINDOW_WEEKS,
    RECENT_WEEKS,
    emptyVelocity,
    summariseWeekly,
    getSalesVelocity,
};
