/**
 * Self-check for the investor decision metrics.
 *
 * Run with:  node --experimental-strip-types src/lib/investor/metrics.check.ts
 *
 * `**\/*.check.ts` is excluded from tsconfig, so this never enters the Next
 * build — it's a plain runnable assertion file, no test framework.
 */

import assert from "node:assert";
import {
  deriveInvestorMetrics,
  formatWait,
  marginTierHint,
  bandFor,
  DEFAULT_MARGIN_BANDS,
} from "./metrics.ts";

// A product priced the Phase 10 way (listing 120 at a 20% margin), with the
// Phase 20 margin bands admin set on it: sells within 10 days earns 5%, within
// 15 earns 10%, slower earns 15%.
const BANDS = {
  low: { days: 10, pct: 5 },
  medium: { days: 15, pct: 10 },
  high: { days: 90, pct: 15 },
};

const base = {
  _id: "p1",
  price: 120,
  investorPrice: 100,
  investorPayout: 105,
  investableUnits: 10,
  investedUnits: 3,
  remainingInvestableUnits: 7,
  salesWindowWeeks: 12,
  recentWeeks: 4,
  marginBands: BANDS,
  marginCategory: "low" as const,
  createdAt: new Date().toISOString(),
};

// --- Velocity, queue and the wait estimate -----------------------------
{
  // 8 units over the last 4 weeks = 2/wk. 3 unmatched ahead, so a new unit is
  // 4th in the FIFO queue and waits for 4 sales = 2 weeks.
  const m = deriveInvestorMetrics({
    ...base,
    salesByWeek: [0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2],
    unitsSoldRecent: 8,
    unitsSoldWindow: 8,
    queueAhead: 3,
  });

  assert.strictEqual(m.roi, 5, "the low band pays 5%");
  assert.strictEqual(m.velocityPerWeek, 2);
  assert.strictEqual(m.estDaysToSale, 14);
  assert.strictEqual(m.annualisedReturn, 130.4, "5% earned back in 14 days");
  // The product shifts a unit every 3.5 days; the investor's 3-deep queue
  // stretches THEIR wait to 14 days without moving the product's band.
  assert.strictEqual(m.daysToSellOneUnit, 3.5);
  assert.strictEqual(m.marginTier, "low");
}

// --- The point of annualising: same band, wildly different investment --
//
// Two listings in the SAME band pay the same percentage, so only the wait
// separates them — which is exactly what annualising exposes.
{
  const fast = deriveInvestorMetrics({
    ...base,
    salesByWeek: [0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5],
    unitsSoldRecent: 20,
    unitsSoldWindow: 20,
    queueAhead: 0,
  });
  const slow = deriveInvestorMetrics({
    ...base,
    salesByWeek: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    unitsSoldRecent: 0,
    unitsSoldWindow: 1,
    queueAhead: 8,
  });

  assert.strictEqual(fast.roi, slow.roi, "same band, so the headline return is identical");
  assert.ok(
    fast.annualisedReturn! > slow.annualisedReturn! * 10,
    "but annualised separates them by more than 10x"
  );
}

// --- A higher band pays more, but takes longer to pay it ---------------
//
// The trade-off the whole feature is built on. Annualised is what reconciles
// them, which is why it stays the default sort.
{
  const quick = deriveInvestorMetrics({
    ...base,
    marginCategory: "low",
    salesByWeek: [0, 0, 0, 0, 0, 0, 0, 0, 7, 7, 7, 7],
    unitsSoldRecent: 28,
    unitsSoldWindow: 28,
    queueAhead: 0,
  });
  const patient = deriveInvestorMetrics({
    ...base,
    marginCategory: "high",
    salesByWeek: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    unitsSoldRecent: 1,
    unitsSoldWindow: 1,
    queueAhead: 0,
  });

  assert.strictEqual(quick.roi, 5);
  assert.strictEqual(patient.roi, 15, "three times the headline return");
  assert.ok(patient.estDaysToSale! > quick.estDaysToSale! * 10, "but a far longer wait");
  assert.ok(
    quick.annualisedReturn! > patient.annualisedReturn!,
    "so the fast 5% is the better annualised deal despite the smaller headline"
  );
}

// --- Queue depth alone changes the answer ------------------------------
{
  const shortQueue = deriveInvestorMetrics({
    ...base,
    salesByWeek: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    unitsSoldRecent: 4,
    unitsSoldWindow: 4,
    queueAhead: 0,
  });
  const longQueue = deriveInvestorMetrics({
    ...base,
    salesByWeek: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    unitsSoldRecent: 4,
    unitsSoldWindow: 4,
    queueAhead: 19,
  });

  assert.strictEqual(shortQueue.estDaysToSale, 7, "1/wk, first in line");
  assert.strictEqual(longQueue.estDaysToSale, 140, "1/wk, 20th in line");
  assert.ok(longQueue.annualisedReturn! < shortQueue.annualisedReturn!);

  // ...but the margin band must NOT move with the queue. It is a property of
  // the product, so admin and every investor read the same band off the same
  // listing no matter where in the FIFO queue they'd land.
  assert.strictEqual(shortQueue.daysToSellOneUnit, 7);
  assert.strictEqual(longQueue.daysToSellOneUnit, 7);
  assert.strictEqual(shortQueue.marginTier, "low");
  assert.strictEqual(longQueue.marginTier, "low");
  assert.strictEqual(shortQueue.roi, longQueue.roi, "same band, same headline return");
}

// --- Falls back to the full window when the recent one is empty ---------
{
  const m = deriveInvestorMetrics({
    ...base,
    salesByWeek: [2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0],
    unitsSoldRecent: 0,
    unitsSoldWindow: 12,
    queueAhead: 0,
  });
  assert.strictEqual(m.velocityPerWeek, 1, "12 units / 12 weeks");
  assert.strictEqual(m.estDaysToSale, 7);
}

// --- No velocity means NO estimate, never a zero or an Infinity ---------
{
  const stalled = deriveInvestorMetrics({
    ...base,
    salesByWeek: new Array(12).fill(0),
    unitsSoldRecent: 0,
    unitsSoldWindow: 0,
    queueAhead: 2,
    avgDaysToMatch: 40, // it HAS sold before, just not in the window
  });
  assert.strictEqual(stalled.estDaysToSale, null);
  assert.strictEqual(stalled.annualisedReturn, null);
  assert.ok(Number.isFinite(stalled.velocityPerWeek));

  // `stalled` and `untested` are GONE. They existed only because the rolling
  // velocity window could empty out and leave a product with no tier at all.
  // A band comes from the product's own rules now, so a product with no sales
  // still has exactly one of the three real bands — the API's resolved one.
  const quiet = deriveInvestorMetrics({
    ...base,
    salesByWeek: new Array(12).fill(0),
    unitsSoldRecent: 0,
    unitsSoldWindow: 0,
    queueAhead: 0,
  });
  assert.strictEqual(quiet.marginTier, "low", "the API's band stands with zero sales");
  assert.strictEqual(stalled.marginTier, "low");
  assert.strictEqual(stalled.daysToSellOneUnit, null, "still no wait estimate, though");
  // Which means the band always has a percentage behind it, so the card never
  // has to render a dash where a return should be.
  assert.strictEqual(quiet.roi, 5);
}

// --- Missing backend fields must not produce NaN -----------------------
{
  const m = deriveInvestorMetrics({ _id: "bare", price: 0 });
  for (const [key, value] of Object.entries(m)) {
    if (typeof value === "number") {
      assert.ok(!Number.isNaN(value), `${key} was NaN on a bare product`);
    }
  }
  assert.strictEqual(m.estDaysToSale, null);
  // No bands and no velocity: the slowest band, because nothing proves it
  // sells quickly. Never a crash, and never the cheapest band by accident.
  assert.strictEqual(m.marginTier, "high");
  assert.strictEqual(m.salesByWeek.length, 12, "defaults to a full empty series");
  assert.deepStrictEqual(
    m.marginBands,
    DEFAULT_MARGIN_BANDS,
    "a payload with no bands falls back rather than classifying on NaN"
  );
}

// --- Band boundaries, against this product's own bands ------------------
//
// These mirror the backend's bandFor() exactly. The server decides money off
// its copy; this is the display copy, and the two must never disagree.
{
  assert.strictEqual(bandFor(0, BANDS), "low");
  assert.strictEqual(bandFor(10, BANDS), "low", "exactly the low window is still low");
  assert.strictEqual(bandFor(10.1, BANDS), "medium");
  assert.strictEqual(bandFor(15, BANDS), "medium", "exactly the medium window");
  assert.strictEqual(bandFor(15.1, BANDS), "high");
  assert.strictEqual(bandFor(90, BANDS), "high");
  assert.strictEqual(bandFor(400, BANDS), "high", "slower than the high window stays high");

  // Per-product rules: the SAME wait is a different band under another
  // product's numbers. This is why the rules moved off the category.
  const strict = { low: { days: 2, pct: 1 }, medium: { days: 4, pct: 2 }, high: { days: 9, pct: 3 } };
  assert.strictEqual(bandFor(3, BANDS), "low", "3 days is fast for this product");
  assert.strictEqual(bandFor(3, strict), "medium", "...but only medium under stricter rules");
  assert.strictEqual(bandFor(30, strict), "high");
}

// --- The band the API sent wins over any local classification ----------
//
// Only the server can see admin's starting pick and the product's observed
// sell times, so a resolved marginCategory is authoritative. Classifying the
// forward estimate locally would disagree with what the investor is paid.
{
  const m = deriveInvestorMetrics({
    ...base,
    marginCategory: "high",
    salesByWeek: [0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5],
    unitsSoldRecent: 20,
    unitsSoldWindow: 20,
    queueAhead: 0,
  });
  assert.strictEqual(m.daysToSellOneUnit, 1.4, "it is selling fast");
  assert.strictEqual(m.marginTier, "high", "but the API says high, so high it is");
  assert.strictEqual(m.roi, 15, "and the return is that band's percentage");

  // With no band from the API, fall back to classifying rather than crashing.
  const { marginCategory, ...noBand } = base;
  const fallback = deriveInvestorMetrics({
    ...noBand,
    salesByWeek: [0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5],
    unitsSoldRecent: 20,
    unitsSoldWindow: 20,
    queueAhead: 0,
  });
  assert.strictEqual(fallback.marginTier, "low", "1.4 days is inside the 10-day low band");

  // Nothing selling at all has no estimate, so it reads as the slowest band —
  // never a crash, and never the cheapest band by accident.
  const dead = deriveInvestorMetrics({
    ...noBand,
    salesByWeek: new Array(12).fill(0),
    unitsSoldRecent: 0,
    unitsSoldWindow: 0,
    queueAhead: 0,
  });
  assert.strictEqual(dead.daysToSellOneUnit, null);
  assert.strictEqual(dead.marginTier, "high");
}

// --- roi is the band percentage, and payoutRange spells out all three ---
{
  const m = deriveInvestorMetrics({ ...base, marginCategory: "medium" });
  assert.strictEqual(m.roi, 10, "the medium band pays 10%");
  assert.deepStrictEqual(
    m.payoutRange.map((b) => [b.band, b.pct, b.payout]),
    [
      ["low", 5, 105],
      ["medium", 10, 110],
      ["high", 15, 115],
    ],
    "100 of capital against 5/10/15% bands"
  );
  // A longer wait must never pay less — the invariant the backend validates.
  const pcts = m.payoutRange.map((b) => b.pct);
  assert.ok(pcts[0] <= pcts[1] && pcts[1] <= pcts[2]);

  // An API-supplied range is trusted over the locally derived one.
  const supplied = deriveInvestorMetrics({
    ...base,
    payoutRange: [
      { band: "low", days: 10, pct: 1, payout: 101 },
      { band: "medium", days: 15, pct: 2, payout: 102 },
      { band: "high", days: 90, pct: 3, payout: 103 },
    ],
  });
  assert.strictEqual(supplied.payoutRange[0].payout, 101);
}

// --- Hints are generated from the product's bands, never hardcoded -----
{
  assert.strictEqual(marginTierHint("low", BANDS), "Sells in 10 days or less — earns 5%");
  assert.strictEqual(marginTierHint("medium", BANDS), "Sells in 10–15 days — earns 10%");
  assert.strictEqual(marginTierHint("high", BANDS), "Slower than 15 days — earns 15%");
  assert.strictEqual(
    marginTierHint("low", { ...BANDS, low: { days: 1, pct: 5 } }),
    "Sells in 1 day or less — earns 5%",
    "singular day"
  );
  // Every band must produce a hint — a missing one used to be possible when
  // `stalled`/`untested` existed and were handled separately.
  for (const band of ["low", "medium", "high"] as const) {
    assert.ok(marginTierHint(band, BANDS).length > 0);
  }
}

// --- formatWait --------------------------------------------------------
assert.strictEqual(formatWait(null), "—");
assert.strictEqual(formatWait(0.5), "under a day");
assert.strictEqual(formatWait(1), "1 day");
assert.strictEqual(formatWait(14), "14 days");
assert.strictEqual(formatWait(59), "59 days");
assert.strictEqual(formatWait(91), "3.0 months");

console.log("investor metrics: all checks passed");
