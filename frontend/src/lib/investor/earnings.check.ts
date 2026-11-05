/**
 * Self-check for the earnings filtering, banding and summary.
 *
 * Run with:  node --experimental-strip-types src/lib/investor/earnings.check.ts
 */

import assert from "node:assert";
import {
  ROI_BANDS,
  roiBandOf,
  roiAsDisplayed,
  formatRoi,
  ROI_BAND_OPTIONS,
  applyEarningsFilters,
  applyEarningsSort,
  earningsSummary,
  bandCounts,
  countActiveEarningsFilters,
  EMPTY_EARNINGS_FILTERS,
  type EarningsFilters,
} from "./earnings.ts";
import type { Position } from "./portfolio.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 16);

/** A position with sane defaults, overridable per case. */
const pos = (over: Partial<Position> & { productName: string }): Position =>
  ({
    productId: over.productName,
    productImage: undefined,
    units: [],
    unitsTotal: 1,
    unitsWaiting: 0,
    unitsSold: 1,
    atRisk: 0,
    capitalDeployed: 100,
    refundedTotal: 0,
    realisedProfit: 20,
    unrealisedProfit: 0,
    avgBuyPrice: 100,
    roi: 20,
    firstInvestedAt: NOW - 10 * DAY,
    lastInvestedAt: NOW - 10 * DAY,
    avgDaysToSell: 10,
    longestWaitDays: null,
    ...over,
  }) as Position;

const f = (over: Partial<EarningsFilters> = {}): EarningsFilters => ({
  ...EMPTY_EARNINGS_FILTERS,
  ...over,
});

/* ------------------------------- banding -------------------------------- */

assert.strictEqual(roiBandOf(25), "high");
assert.strictEqual(roiBandOf(ROI_BANDS.high), "high", "the boundary is inclusive");
// −0.06 rather than −0.01: 19.99 DISPLAYS as 20.0% and so bands high, which
// is the intended behaviour. 19.94 displays as 19.9% and genuinely is mid.
assert.strictEqual(roiBandOf(ROI_BANDS.high - 0.06), "mid");
assert.strictEqual(roiBandOf(ROI_BANDS.mid), "mid", "the boundary is inclusive");
assert.strictEqual(roiBandOf(ROI_BANDS.mid - 0.06), "low");
assert.strictEqual(roiBandOf(0), "low", "break-even is low, not a loss");
// −0.01% displays as −0.0%, i.e. break-even, so it bands low rather than
// flagging a loss over a rounding artefact. See the roiAsDisplayed cases below.
assert.strictEqual(roiBandOf(-0.01), "low");
assert.strictEqual(roiBandOf(-50), "negative");

// Every band has a label, and the labels are generated from the thresholds —
// so moving a threshold can't leave a chip claiming the old number.
assert.strictEqual(ROI_BAND_OPTIONS.length, 5);
assert.ok(
  ROI_BAND_OPTIONS.find((o) => o.value === "high")!.label.includes(String(ROI_BANDS.high)),
  "the high label must name the real threshold"
);

// A return is banded on the value the investor SEES, not the raw float.
// 19.9965% displays as "+20.0%", and a row labelled 20% must not sit outside
// the "≥20%" filter — this came off real data.
assert.strictEqual(roiAsDisplayed(19.9965), 20);
assert.strictEqual(formatRoi(19.9965), "+20.0%");
assert.strictEqual(
  roiBandOf(19.9965),
  "high",
  "a return displayed as 20.0% must band as high, not mid"
);
assert.strictEqual(roiBandOf(19.94), "mid", "19.9% displays below the threshold and bands mid");
assert.strictEqual(roiBandOf(-0.04), "low", "−0.04% displays as 0.0%, which is not a loss");
assert.strictEqual(roiBandOf(-0.05), "negative", "−0.05% displays as −0.1%");
assert.strictEqual(formatRoi(-8), "−8.0%".replace("−", "-"), "losses carry no plus sign");

/* ------------------------------- filtering ------------------------------ */

const ALL = [
  pos({ productName: "Marble Tile", roi: 30, realisedProfit: 60, capitalDeployed: 200 }),
  pos({ productName: "Granite Slab", roi: 15, realisedProfit: 15 }),
  pos({ productName: "Wood Panel", roi: 5, realisedProfit: 5 }),
  pos({ productName: "Loss Maker", roi: -8, realisedProfit: -8 }),
  pos({
    productName: "Open Position",
    roi: 20,
    unitsSold: 0,
    unitsWaiting: 2,
    atRisk: 200,
    capitalDeployed: 200,
    realisedProfit: 0,
    unrealisedProfit: 40,
    avgDaysToSell: null,
  }),
];

// No filters is everything.
assert.strictEqual(applyEarningsFilters(ALL, f(), NOW).length, 5);

// Bands.
assert.deepStrictEqual(
  applyEarningsFilters(ALL, f({ band: "high" }), NOW).map((p) => p.productName),
  ["Marble Tile", "Open Position"]
);
assert.deepStrictEqual(
  applyEarningsFilters(ALL, f({ band: "mid" }), NOW).map((p) => p.productName),
  ["Granite Slab"]
);
assert.deepStrictEqual(
  applyEarningsFilters(ALL, f({ band: "low" }), NOW).map((p) => p.productName),
  ["Wood Panel"]
);
assert.deepStrictEqual(
  applyEarningsFilters(ALL, f({ band: "negative" }), NOW).map((p) => p.productName),
  ["Loss Maker"]
);

// Status. A position can be both paid-out and waiting, so these overlap by
// design rather than partitioning.
assert.ok(
  !applyEarningsFilters(ALL, f({ status: "realised" }), NOW).some(
    (p) => p.productName === "Open Position"
  ),
  "a position with nothing sold is not 'paid out'"
);
assert.deepStrictEqual(
  applyEarningsFilters(ALL, f({ status: "open" }), NOW).map((p) => p.productName),
  ["Open Position"]
);
{
  const both = pos({ productName: "Both", unitsSold: 1, unitsWaiting: 1, unitsTotal: 2 });
  assert.strictEqual(applyEarningsFilters([both], f({ status: "realised" }), NOW).length, 1);
  assert.strictEqual(applyEarningsFilters([both], f({ status: "open" }), NOW).length, 1);
}

// Search is case-insensitive and matches partials.
assert.deepStrictEqual(
  applyEarningsFilters(ALL, f({ query: "marble" }), NOW).map((p) => p.productName),
  ["Marble Tile"]
);
assert.strictEqual(applyEarningsFilters(ALL, f({ query: "  SLAB " }), NOW).length, 1);
assert.strictEqual(applyEarningsFilters(ALL, f({ query: "nothing" }), NOW).length, 0);

// Period, dated on the most recent stake.
{
  const old = pos({ productName: "Old", lastInvestedAt: NOW - 200 * DAY });
  const fresh = pos({ productName: "Fresh", lastInvestedAt: NOW - 5 * DAY });
  const set = [old, fresh];

  assert.deepStrictEqual(
    applyEarningsFilters(set, f({ period: "30d" }), NOW).map((p) => p.productName),
    ["Fresh"]
  );
  assert.strictEqual(applyEarningsFilters(set, f({ period: "1y" }), NOW).length, 2);
  assert.strictEqual(applyEarningsFilters(set, f({ period: "all" }), NOW).length, 2);

  // Topped up recently counts as recent even if opened long ago.
  const toppedUp = pos({
    productName: "Topped",
    firstInvestedAt: NOW - 300 * DAY,
    lastInvestedAt: NOW - 2 * DAY,
  });
  assert.strictEqual(applyEarningsFilters([toppedUp], f({ period: "30d" }), NOW).length, 1);
}

// Custom range, and a half-typed bound must not empty the table.
assert.deepStrictEqual(
  applyEarningsFilters(ALL, f({ minRoi: "15", maxRoi: "25" }), NOW).map((p) => p.productName),
  ["Granite Slab", "Open Position"]
);
assert.strictEqual(applyEarningsFilters(ALL, f({ minRoi: "" }), NOW).length, 5, "blank = no bound");
assert.strictEqual(applyEarningsFilters(ALL, f({ minRoi: "-" }), NOW).length, 5, "mid-typing = no bound");
assert.strictEqual(applyEarningsFilters(ALL, f({ maxRoi: "abc" }), NOW).length, 5, "garbage = no bound");
assert.strictEqual(applyEarningsFilters(ALL, f({ minRoi: "-10" }), NOW).length, 5, "negatives are a valid bound");

// The custom range compares as displayed too, so typing 20 catches a row the
// table shows as 20.0%.
{
  const almost = pos({ productName: "Almost", roi: 19.9965 });
  assert.strictEqual(
    applyEarningsFilters([almost], f({ minRoi: "20" }), NOW).length,
    1,
    "a row shown as 20.0% must satisfy min=20"
  );
}

/* --- margin band --------------------------------------------------------- */
{
  const tiered = [
    pos({ productName: "Quick", marginTier: "low" }),
    pos({ productName: "Steady", marginTier: "medium" }),
    pos({ productName: "Sticky", marginTier: "high" }),
    // No band attached: the product is no longer listed. Must still appear
    // unfiltered — the capital is still in it — and it reads as the lowest
    // band, since `untested` no longer exists to park it under.
    pos({ productName: "Delisted" }),
  ];

  assert.strictEqual(applyEarningsFilters(tiered, f(), NOW).length, 4, "unfiltered keeps all");
  assert.deepStrictEqual(
    applyEarningsFilters(tiered, f({ tier: "medium" }), NOW).map((p) => p.productName),
    ["Steady"]
  );
  assert.deepStrictEqual(
    applyEarningsFilters(tiered, f({ tier: "high" }), NOW).map((p) => p.productName),
    ["Sticky"],
    "high is the slowest, best-paying band now — not the fastest"
  );
  assert.deepStrictEqual(
    applyEarningsFilters(tiered, f({ tier: "low" }), NOW).map((p) => p.productName),
    ["Quick", "Delisted"],
    "a position with no band falls under low rather than vanishing"
  );
  assert.strictEqual(countActiveEarningsFilters(f({ tier: "high" })), 1);
  assert.strictEqual(countActiveEarningsFilters(f({ tier: "all" })), 0);
}

// Filters compose.
assert.deepStrictEqual(
  applyEarningsFilters(ALL, f({ band: "high", status: "open" }), NOW).map((p) => p.productName),
  ["Open Position"]
);
assert.deepStrictEqual(
  applyEarningsFilters(
    [pos({ productName: "Slow loser", roi: -5, marginTier: "high" }), pos({ productName: "Slow winner", marginTier: "high" })],
    f({ tier: "high", band: "negative" }),
    NOW
  ).map((p) => p.productName),
  ["Slow loser"],
  "margin band composes with the return band"
);

/* -------------------------------- sorting ------------------------------- */

assert.deepStrictEqual(
  applyEarningsSort(ALL, "profit").map((p) => p.productName),
  ["Marble Tile", "Open Position", "Granite Slab", "Wood Panel", "Loss Maker"]
);
assert.deepStrictEqual(applyEarningsSort(ALL, "roi")[0].productName, "Marble Tile");
assert.strictEqual(applyEarningsSort(ALL, "capital")[0].capitalDeployed, 200);

// Never-sold positions have no speed, so they rank last rather than first.
assert.strictEqual(
  applyEarningsSort(ALL, "fastest").at(-1)!.productName,
  "Open Position",
  "a position that has never sold must not sort as the fastest"
);

// Sorting must not mutate the caller's array.
{
  const before = ALL.map((p) => p.productName);
  applyEarningsSort(ALL, "roi");
  assert.deepStrictEqual(ALL.map((p) => p.productName), before, "applyEarningsSort copied");
}

/* -------------------------------- summary ------------------------------- */

{
  const s = earningsSummary(ALL);
  assert.strictEqual(s.productCount, 5);
  assert.strictEqual(s.realisedProfit, 72, "60 + 15 + 5 - 8");
  assert.strictEqual(s.unrealisedProfit, 40);
  assert.strictEqual(s.netProfit, 112);
  assert.strictEqual(s.capitalDeployed, 700, "200 + 100 + 100 + 100 + 200");
  assert.strictEqual(s.atRisk, 200);
  assert.strictEqual(s.roi, 16, "112 / 700");
  assert.strictEqual(s.best!.productName, "Marble Tile");
  assert.strictEqual(s.worst!.productName, "Loss Maker");

  // Realised ROI uses only the capital behind units that sold, so money
  // still waiting doesn't dilute it.
  // Sold-unit capital is 200 + 100 + 100 + 100 = 500; the open position's
  // 200 is excluded because none of its units have sold.
  assert.strictEqual(s.realisedRoi, 14.4, "72 over the 500 staked on sold units");
}

// The summary moves with the filter — that's the whole point of filtering.
{
  const filtered = applyEarningsFilters(ALL, f({ band: "high" }), NOW);
  const s = earningsSummary(filtered);
  assert.strictEqual(s.productCount, 2);
  assert.strictEqual(s.netProfit, 100, "60 realised + 40 unrealised");
}

// An empty set summarises to zeroes, not NaN.
{
  const s = earningsSummary([]);
  assert.strictEqual(s.netProfit, 0);
  assert.strictEqual(s.roi, 0);
  assert.strictEqual(s.realisedRoi, 0);
  assert.strictEqual(s.avgDaysToSell, null);
  assert.strictEqual(s.best, null);
  assert.strictEqual(s.worst, null);
}

// A single position has no "worst" — it's the same row as the best.
assert.strictEqual(earningsSummary([ALL[0]]).worst, null);

// Average days to sell is weighted by units, not a mean of means.
{
  const fast = pos({ productName: "Fast", unitsSold: 10, unitsTotal: 10, avgDaysToSell: 30 });
  const slow = pos({ productName: "Slow", unitsSold: 1, unitsTotal: 1, avgDaysToSell: 300 });
  const s = earningsSummary([fast, slow]);
  assert.strictEqual(s.avgDaysToSell, round2((30 * 10 + 300) / 11));
  assert.ok(s.avgDaysToSell! < 60, "ten fast units must outweigh one slow one");
}

function round2(n: number) {
  return Number(n.toFixed(2));
}

/* ------------------------------ band counts ----------------------------- */

{
  const counts = bandCounts(ALL);
  assert.strictEqual(counts.all, 5);
  assert.strictEqual(counts.high, 2);
  assert.strictEqual(counts.mid, 1);
  assert.strictEqual(counts.low, 1);
  assert.strictEqual(counts.negative, 1);
  assert.strictEqual(
    counts.high + counts.mid + counts.low + counts.negative,
    counts.all,
    "every position lands in exactly one band"
  );
}

/* ---------------------------- active filter count ----------------------- */

assert.strictEqual(countActiveEarningsFilters(EMPTY_EARNINGS_FILTERS), 0);
assert.strictEqual(countActiveEarningsFilters(f({ band: "high" })), 1);
assert.strictEqual(countActiveEarningsFilters(f({ query: "  " })), 0, "whitespace is not a filter");
assert.strictEqual(countActiveEarningsFilters(f({ query: "x", band: "low", period: "30d" })), 3);
assert.strictEqual(countActiveEarningsFilters(f({ sort: "roi" })), 1, "a non-default sort counts");

console.log("earnings: all checks passed");
